package app.folyo.media;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.access.CardAccess;
import app.folyo.asset.ImageProcessor;
import app.folyo.card.Card;
import app.folyo.card.CardRepository;
import app.folyo.card.CardType;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * Galeri fotograflari. Dosya ile DB satiri ayri sistemlerde oldugu icin sira bilincli:
 * yuklemede once dosya yazilir, DB basarisizsa dosya silinir; silmede once DB commit edilir, sonra dosya silinir.
 * En kotu durumda diskte sahipsiz dosya kalir, ama DB'de dosyasi olmayan kayit kalmaz.
 */
@Service
public class MediaService {

    static final int MAX_PHOTOS_PER_GALLERY = 12;

    /** url: kartta hizli acilan kopya; originalUrl: orijinal kalite. */
    public record MediaView(UUID id, String url, String originalUrl, Integer width, Integer height) {

        static MediaView from(Media media) {
            String url = "/api/public/media/" + media.getId();
            return new MediaView(media.getId(), url, media.getOriginalKey() == null ? url : url + "?size=original",
                    media.getWidth(), media.getHeight());
        }
    }

    public record StoredFile(byte[] bytes, String contentType) {
    }

    private final MediaRepository media;
    private final CardRepository cards;
    private final ProfileService profileService;
    static final int DISPLAY_EDGE = 1600;

    private final ImageProcessor images;
    private final MediaStorage storage;
    private final TransactionTemplate transaction;
    private final CardAccess cardAccess;

    public MediaService(MediaRepository media, CardRepository cards, ProfileService profileService,
            ImageProcessor images, MediaStorage storage, TransactionTemplate transaction, CardAccess cardAccess) {
        this.cardAccess = cardAccess;
        this.media = media;
        this.cards = cards;
        this.profileService = profileService;
        this.images = images;
        this.storage = storage;
        this.transaction = transaction;
    }

    public MediaView upload(UUID userId, UUID cardId, byte[] upload) {
        // Ucuz kontroller once: yanlis karta yuklemede gorsel islenmez.
        Profile owner = profileService.requireByUserId(userId);
        requireGallery(cardId, owner.getId());

        // Orijinal kalite korunur (metadata kayipsiz silinir); kartta hizli acilsin diye buyukse 1600 px kopya da yazilir.
        ImageProcessor.Processed photo = images.process(upload, List.of(new ImageProcessor.Spec("large", DISPLAY_EDGE, false)));
        boolean resized = Math.max(photo.width(), photo.height()) > DISPLAY_EDGE;
        String originalKey = UUID.randomUUID() + "." + extension(photo.format());
        storage.write(originalKey, photo.original());
        String key;
        String contentType;
        int size;
        if (resized) {
            ImageProcessor.Variant large = photo.variants().get("large");
            key = UUID.randomUUID() + "." + large.ext();
            storage.write(key, large.bytes());
            contentType = large.contentType();
            size = large.bytes().length;
        } else {
            key = originalKey;
            contentType = contentType(photo.format());
            size = photo.original().length;
        }
        List<String> written = resized ? List.of(key, originalKey) : List.of(key);
        try {
            Media saved = transaction.execute(status -> {
                Profile profile = profileService.lockByUserId(userId);
                requireGallery(cardId, profile.getId());
                if (media.countByCardId(cardId) >= MAX_PHOTOS_PER_GALLERY) {
                    throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT,
                            "Bir galeride en fazla " + MAX_PHOTOS_PER_GALLERY + " fotoğraf olabilir");
                }
                int position = media.findMaxPosition(cardId) + 1;
                return media.save(new Media(cardId, key, resized ? originalKey : null, contentType, size, photo.width(),
                        photo.height(), position));
            });
            return MediaView.from(saved);
        } catch (RuntimeException e) {
            storage.deleteQuietly(written);
            throw e;
        }
    }

    public void delete(UUID userId, UUID mediaId) {
        List<String> keys = transaction.execute(status -> {
            Profile profile = profileService.lockByUserId(userId);
            Media item = media.findById(mediaId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fotoğraf bulunamadı"));
            requireGallery(item.getCardId(), profile.getId());
            media.delete(item);
            return MediaRepository.keys(List.of(item));
        });
        storage.deleteQuietly(keys);
    }

    /** Kart listelerinde galeri fotograflarini tek sorguda getirir. */
    public Map<UUID, List<MediaView>> viewsByCard(List<Card> cardList) {
        List<UUID> galleryIds = cardList.stream().filter(c -> c.getType() == CardType.GALLERY).map(Card::getId)
                .toList();
        Map<UUID, List<MediaView>> result = new LinkedHashMap<>();
        if (galleryIds.isEmpty()) {
            return result;
        }
        galleryIds.forEach(id -> result.put(id, new java.util.ArrayList<>()));
        for (Media item : media.findByCardIdInOrderByPosition(galleryIds)) {
            result.get(item.getCardId()).add(MediaView.from(item));
        }
        return result;
    }

    /** Fotograf, kartini gorebilen kisiye gosterilir (gizli galeri yalniz sahibine, kitle secimine uyarak). */
    public Optional<StoredFile> read(UUID mediaId, FolyoPrincipal principal, boolean original) {
        return media.findById(mediaId).flatMap(item -> cards.findById(item.getCardId())
                .filter(card -> cardAccess.canSee(card, principal))
                .map(card -> original && item.getOriginalKey() != null
                        ? new StoredFile(storage.read(item.getOriginalKey()), contentTypeOf(item.getOriginalKey()))
                        : new StoredFile(storage.read(item.getStorageKey()), item.getContentType())));
    }

    private static String extension(ImageProcessor.Format format) {
        return switch (format) {
            case JPEG -> "jpg";
            case PNG -> "png";
            case WEBP -> "webp";
        };
    }

    private static String contentType(ImageProcessor.Format format) {
        return switch (format) {
            case JPEG -> "image/jpeg";
            case PNG -> "image/png";
            case WEBP -> "image/webp";
        };
    }

    private static String contentTypeOf(String key) {
        return key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg";
    }

    private void requireGallery(UUID cardId, UUID profileId) {
        Card card = cards.findById(cardId).filter(c -> c.getProfileId().equals(profileId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Kart bulunamadı"));
        if (card.getType() != CardType.GALLERY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fotoğraf yalnız galeri kartına eklenir");
        }
    }
}
