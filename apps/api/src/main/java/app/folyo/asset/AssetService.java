package app.folyo.asset;

import app.folyo.auth.UserRepository;
import app.folyo.settings.StorageSettings;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Fotograf, video, profil fotografi ve sticker yuklemeleri. Dosya once depoya yazilir, sonra kaydi olusur; kayit
 * olusmazsa dosya silinir. Gonderiye/sohbete baglanmayan yuklemeler bir gun sonra temizlenir.
 */
@Service
public class AssetService {

    private static final Logger log = LoggerFactory.getLogger(AssetService.class);

    static final long MAX_PHOTO_BYTES = 25L * 1024 * 1024;
    static final long MAX_VIDEO_BYTES = 200L * 1024 * 1024;
    static final long MAX_STICKER_BYTES = 1024L * 1024;
    static final int MAX_STICKER_EDGE = 1024;
    static final int MAX_STICKERS = 60;

    private static final List<ImageProcessor.Spec> PHOTO = List.of(
            new ImageProcessor.Spec("thumb", 480, false), new ImageProcessor.Spec("large", 1600, false));
    private static final List<ImageProcessor.Spec> AVATAR = List.of(
            new ImageProcessor.Spec("avatar", 512, true), new ImageProcessor.Spec("small", 128, true));
    private static final List<ImageProcessor.Spec> STICKER = List.of(new ImageProcessor.Spec("sticker", 320, false));

    private final AssetRepository assets;
    private final BlobStores stores;
    private final ImageProcessor images;
    private final VideoProcessor videos;
    private final UserRepository users;
    private final TransactionTemplate transaction;

    public AssetService(AssetRepository assets, BlobStores stores, ImageProcessor images, VideoProcessor videos,
            UserRepository users, TransactionTemplate transaction) {
        this.assets = assets;
        this.stores = stores;
        this.images = images;
        this.videos = videos;
        this.users = users;
        this.transaction = transaction;
    }

    public AssetView uploadPhoto(UUID ownerId, MultipartFile file) {
        byte[] bytes = read(file, MAX_PHOTO_BYTES, "Fotoğraf en fazla 25 MB olabilir");
        return AssetView.from(storeImage(ownerId, AssetKind.PHOTO, bytes, PHOTO, null));
    }

    public AssetView uploadVideo(UUID ownerId, MultipartFile file) {
        if (file.isEmpty()) {
            throw bad("Bir video seç");
        }
        if (file.getSize() > MAX_VIDEO_BYTES) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Video en fazla 200 MB olabilir");
        }
        Path work = null;
        UUID id = UUID.randomUUID();
        List<String> written = new ArrayList<>();
        StorageSettings.Provider provider = stores.current();
        BlobStore store = stores.get(provider);
        try {
            work = Files.createTempDirectory("folyo-video-");
            Path input = work.resolve("input");
            file.transferTo(input);
            VideoProcessor.Processed video = videos.process(input, work);
            String key = id + "/original." + video.ext();
            store.put(key, video.file(), video.contentType());
            written.add(key);
            String posterKey = id + "/poster.jpg";
            store.put(posterKey, video.poster(), "image/jpeg");
            written.add(posterKey);
            Map<String, Asset.VariantRef> variants = Map.of("poster",
                    new Asset.VariantRef(posterKey, "image/jpeg", video.posterWidth(), video.posterHeight()));
            Asset asset = new Asset(id, ownerId, AssetKind.VIDEO, provider, video.contentType(), Files.size(video.file()),
                    video.width(), video.height(), video.durationMs(), key, variants, null, Instant.now());
            String sha = sha256(video.file());
            transaction.executeWithoutResult(status -> assets.insert(asset, sha));
            return AssetView.from(asset);
        } catch (IOException e) {
            store.deleteQuietly(written);
            throw new UncheckedIOException("Video kaydedilemedi", e);
        } catch (RuntimeException e) {
            store.deleteQuietly(written);
            throw e;
        } finally {
            deleteTree(work);
        }
    }

    /** Profil fotografi: kare kopyalar uretilir, orijinal korunur. Eski fotograf kayit degisince silinir. */
    public String setAvatar(UUID userId, MultipartFile file) {
        byte[] bytes = read(file, MAX_PHOTO_BYTES, "Fotoğraf en fazla 25 MB olabilir");
        Asset asset = storeImage(userId, AssetKind.AVATAR, bytes, AVATAR, Instant.now());
        String url = AssetView.url(asset.id(), "avatar");
        UUID previous = transaction.execute(status -> {
            UUID old = users.lockById(userId).map(u -> u.getAvatarAssetId()).orElse(null);
            users.setUploadedAvatar(userId, asset.id());
            if (old != null) {
                deleteAfterCommit(assets.findAll(List.of(old)));
                assets.delete(List.of(old));
            }
            return old;
        });
        log.debug("Profil fotografi degisti: {} (eski {})", userId, previous);
        return url;
    }

    /** Ozel fotograf kaldirilir; yerine otomatik gorsel (ya da giris hesabinin fotografi) gelir. */
    public void removeAvatar(UUID userId) {
        transaction.executeWithoutResult(status -> {
            UUID old = users.lockById(userId).map(u -> u.getAvatarAssetId()).orElse(null);
            users.setUploadedAvatar(userId, null);
            if (old != null) {
                deleteAfterCommit(assets.findAll(List.of(old)));
                assets.delete(List.of(old));
            }
        });
    }

    /**
     * Otomatik profil gorselini kaydeder (bytes null: kaldir). Ayni girdilerle (key) es zamanli ikinci bir hesap
     * gelirse kaybeden kendi dosyasini siler; eski gorsel commit sonrasi depodan silinir.
     *
     * @return gorsel degistiyse true
     */
    public boolean setAutoAvatar(UUID userId, byte[] bytes, String source, String key, Instant retryAt) {
        Asset created = bytes == null ? null : storeImage(userId, AssetKind.AVATAR, bytes, AVATAR, Instant.now());
        Boolean changed = transaction.execute(status -> {
            var user = users.lockById(userId).orElse(null);
            if (user == null || (key.equals(user.getAutoAvatarKey()) && user.getAutoAvatarRetryAt() == null)) {
                if (created != null) {
                    deleteAfterCommit(List.of(created));
                    assets.delete(List.of(created.id()));
                }
                return false;
            }
            UUID old = user.getAutoAvatarAssetId();
            users.setAutoAvatar(userId, created == null ? null : created.id(), created == null ? null : source, key, retryAt);
            if (old != null) {
                deleteAfterCommit(assets.findAll(List.of(old)));
                assets.delete(List.of(old));
            }
            return true;
        });
        return Boolean.TRUE.equals(changed);
    }

    /** Kendi sticker'in: seffaf PNG/WebP, en fazla 1 MB ve 1024 px. */
    public AssetView addSticker(UUID userId, MultipartFile file) {
        byte[] bytes = read(file, MAX_STICKER_BYTES, "Sticker en fazla 1 MB olabilir");
        ImageProcessor.Format format = ImageProcessor.detect(bytes);
        if (format == ImageProcessor.Format.JPEG) {
            throw bad("Sticker için şeffaf PNG ya da WebP yükle");
        }
        if (assets.countStickers(userId) >= MAX_STICKERS) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, "En fazla " + MAX_STICKERS + " sticker ekleyebilirsin");
        }
        Asset asset = storeImage(userId, AssetKind.STICKER, bytes, STICKER, Instant.now());
        if (Math.max(asset.width(), asset.height()) > MAX_STICKER_EDGE) {
            transaction.executeWithoutResult(status -> {
                deleteAfterCommit(List.of(asset));
                assets.delete(List.of(asset.id()));
            });
            throw bad("Sticker en fazla 1024 piksel olabilir");
        }
        return AssetView.from(asset);
    }

    public List<AssetView> stickers(UUID userId) {
        return assets.stickersOf(userId).stream().map(AssetView::from).toList();
    }

    public void deleteSticker(UUID userId, UUID assetId) {
        transaction.executeWithoutResult(status -> {
            Asset asset = assets.find(assetId).filter(a -> a.kind() == AssetKind.STICKER && a.ownerId().equals(userId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sticker bulunamadı"));
            deleteAfterCommit(List.of(asset));
            assets.delete(List.of(asset.id()));
        });
    }

    /**
     * Gonderi/sohbet yuklemeleri baglar (cagiran transaction icinde). Yalniz sahibinin, henuz baglanmamis
     * fotograf/videolari kabul edilir; sirasi istekteki gibidir.
     */
    public List<Asset> attach(UUID ownerId, List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        if (ids.stream().distinct().count() != ids.size()) {
            throw bad("Aynı dosya iki kez eklenemez");
        }
        Map<UUID, Asset> found = new LinkedHashMap<>();
        assets.lockOwnUnattached(ownerId, ids).forEach(a -> found.put(a.id(), a));
        if (found.size() != ids.size()) {
            throw bad("Dosya bulunamadı ya da zaten kullanılmış; yeniden yükle");
        }
        assets.markAttached(ids);
        return ids.stream().map(found::get).toList();
    }

    /** Kayitlar cagiran transaction'da silinir; dosyalar yalniz commit basarili olursa depodan silinir. */
    public void deleteWithFiles(Collection<Asset> list) {
        if (list.isEmpty()) {
            return;
        }
        deleteAfterCommit(list);
        assets.delete(list.stream().map(Asset::id).toList());
    }

    public Asset require(UUID id) {
        return assets.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Dosya bulunamadı"));
    }

    AssetRepository.Attachment attachmentOf(UUID assetId) {
        return assets.attachmentOf(assetId);
    }

    public BlobStore storeOf(Asset asset) {
        return stores.get(asset.store());
    }

    /** Baglanmamis yuklemeler ve gonderisi/mesaji silinmis medya her saat temizlenir. */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "${folyo.assets.cleanup-initial-delay:PT10M}")
    public void cleanup() {
        Instant now = Instant.now();
        List<Asset> stale = new ArrayList<>(assets.abandoned(now.minus(Duration.ofDays(1))));
        stale.addAll(assets.orphaned(now.minus(Duration.ofHours(1))));
        if (!stale.isEmpty()) {
            transaction.executeWithoutResult(status -> deleteWithFiles(stale));
            log.info("Kullanilmayan {} medya temizlendi", stale.size());
        }
    }

    private Asset storeImage(UUID ownerId, AssetKind kind, byte[] bytes, List<ImageProcessor.Spec> specs,
            Instant attachedAt) {
        ImageProcessor.Processed image = images.process(bytes, specs);
        UUID id = UUID.randomUUID();
        StorageSettings.Provider provider = stores.current();
        BlobStore store = stores.get(provider);
        List<String> written = new ArrayList<>();
        try {
            String key = id + "/original." + image.format().ext;
            store.put(key, image.original(), image.format().contentType);
            written.add(key);
            Map<String, Asset.VariantRef> variants = new LinkedHashMap<>();
            for (ImageProcessor.Spec spec : specs) {
                ImageProcessor.Variant variant = image.variants().get(spec.name());
                // Orijinal zaten kucukse ve kirpma yoksa kopya yerine orijinal kullanilir (kalite kaybi olmaz).
                if (!spec.square() && Math.max(image.width(), image.height()) <= spec.maxEdge()) {
                    continue;
                }
                String variantKey = id + "/" + spec.name() + "." + variant.ext();
                store.put(variantKey, variant.bytes(), variant.contentType());
                written.add(variantKey);
                variants.put(spec.name(), new Asset.VariantRef(variantKey, variant.contentType(), variant.width(),
                        variant.height()));
            }
            Asset asset = new Asset(id, ownerId, kind, provider, image.format().contentType, image.original().length,
                    image.width(), image.height(), null, key, variants, attachedAt, Instant.now());
            transaction.executeWithoutResult(status -> assets.insert(asset, sha256(image.original())));
            return asset;
        } catch (RuntimeException e) {
            store.deleteQuietly(written);
            throw e;
        }
    }

    private void deleteAfterCommit(Collection<Asset> list) {
        List<Asset> copy = List.copyOf(list);
        Runnable delete = () -> {
            for (Asset asset : copy) {
                try {
                    stores.get(asset.store()).deleteQuietly(AssetRepository.allKeys(asset));
                } catch (RuntimeException e) {
                    log.warn("Medya dosyasi silinemedi: {}", asset.id(), e);
                }
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    delete.run();
                }
            });
        } else {
            delete.run();
        }
    }

    private static byte[] read(MultipartFile file, long max, String tooLarge) {
        if (file == null || file.isEmpty()) {
            throw bad("Bir dosya seç");
        }
        if (file.getSize() > max) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, tooLarge);
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw bad("Dosya okunamadı");
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String sha256(Path file) throws IOException {
        try (InputStream in = new DigestInputStream(Files.newInputStream(file), MessageDigest.getInstance("SHA-256"))) {
            in.transferTo(java.io.OutputStream.nullOutputStream());
            return HexFormat.of().formatHex(((DigestInputStream) in).getMessageDigest().digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void deleteTree(Path dir) {
        if (dir == null) {
            return;
        }
        try (var files = Files.walk(dir)) {
            files.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException e) {
            log.debug("Gecici klasor silinemedi: {}", dir);
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
