package app.folyo.asset;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.chat.ChatService;
import app.folyo.chat.StickerCatalog;
import app.folyo.post.PostService;
import jakarta.servlet.http.HttpServletRequest;
import java.io.InputStream;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class AssetController {

    private static final Set<String> VARIANTS = Set.of("original", "thumb", "large", "poster", "avatar", "small", "sticker");
    private static final Pattern RANGE = Pattern.compile("^bytes=(\\d*)-(\\d*)$");

    private final AssetService assets;
    private final PostService posts;
    private final ChatService chats;
    private final StickerCatalog stickers;

    public AssetController(AssetService assets, PostService posts, ChatService chats, StickerCatalog stickers) {
        this.assets = assets;
        this.posts = posts;
        this.chats = chats;
        this.stickers = stickers;
    }

    @PostMapping("/api/me/assets/photos")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetView photo(@AuthenticationPrincipal FolyoPrincipal principal, @RequestParam("file") MultipartFile file) {
        return assets.uploadPhoto(principal.userId(), file);
    }

    @PostMapping("/api/me/assets/videos")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetView video(@AuthenticationPrincipal FolyoPrincipal principal, @RequestParam("file") MultipartFile file) {
        return assets.uploadVideo(principal.userId(), file);
    }

    @PutMapping("/api/me/avatar")
    public Map<String, String> setAvatar(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestParam("file") MultipartFile file) {
        return Map.of("avatarUrl", assets.setAvatar(principal.userId(), file));
    }

    @DeleteMapping("/api/me/avatar")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeAvatar(@AuthenticationPrincipal FolyoPrincipal principal) {
        assets.removeAvatar(principal.userId());
    }

    public record StickerSet(List<StickerCatalog.Pack> packs, List<AssetView> mine) {
    }

    /** Hazir paketler herkese; kendi sticker'lari yalniz sahibine. */
    @GetMapping("/api/public/stickers")
    public StickerSet catalog(@AuthenticationPrincipal FolyoPrincipal principal) {
        return new StickerSet(stickers.packs(), principal == null ? List.of() : assets.stickers(principal.userId()));
    }

    @PostMapping("/api/me/stickers")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetView addSticker(@AuthenticationPrincipal FolyoPrincipal principal, @RequestParam("file") MultipartFile file) {
        return assets.addSticker(principal.userId(), file);
    }

    @DeleteMapping("/api/me/stickers/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSticker(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id) {
        assets.deleteSticker(principal.userId(), id);
    }

    /** Hazir sticker (SVG). Betik calistirilamasin diye kendi icerik politikasiyla sunulur. */
    @GetMapping("/api/public/stickers/{pack}/{name}.svg")
    public ResponseEntity<byte[]> sticker(@PathVariable String pack, @PathVariable String name) {
        byte[] svg = stickers.svg(pack + "/" + name);
        if (svg == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sticker bulunamadı");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("image/svg+xml"))
                .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .body(svg);
    }

    /**
     * Medya dosyasi. Profil fotografi ve sticker herkese acik; gonderi medyasi gonderiyi gorebilene, sohbet medyasi
     * yalniz sohbetin iki tarafina, baglanmamis yukleme yalniz sahibine. Video aralikli (Range) okunur.
     */
    @GetMapping("/api/public/assets/{id}/{variant}")
    public ResponseEntity<InputStreamResource> read(@PathVariable UUID id, @PathVariable String variant,
            @AuthenticationPrincipal FolyoPrincipal principal, HttpServletRequest request) {
        if (!VARIANTS.contains(variant)) {
            throw notFound();
        }
        Asset asset = assets.require(id);
        boolean isPublic = asset.kind() == AssetKind.AVATAR || asset.kind() == AssetKind.STICKER;
        if (!isPublic && !canRead(asset, principal)) {
            throw notFound();
        }
        Asset.VariantRef ref = asset.variant(variant);
        BlobStore store = assets.storeOf(asset);
        long size = store.size(ref.key());
        CacheControl cache = isPublic ? CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable()
                : CacheControl.maxAge(Duration.ofDays(7)).cachePrivate();

        String range = request.getHeader(HttpHeaders.RANGE);
        Matcher m = range == null ? null : RANGE.matcher(range);
        if (m != null && m.matches() && !(m.group(1).isEmpty() && m.group(2).isEmpty())) {
            long start;
            long end;
            if (m.group(1).isEmpty()) {
                long suffix = Long.parseLong(m.group(2));
                start = Math.max(0, size - suffix);
                end = size - 1;
            } else {
                start = Long.parseLong(m.group(1));
                end = m.group(2).isEmpty() ? size - 1 : Math.min(Long.parseLong(m.group(2)), size - 1);
            }
            if (start > end || start >= size) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + size).build();
            }
            long length = end - start + 1;
            InputStream in = store.open(ref.key(), start, length);
            return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                    .contentType(MediaType.parseMediaType(ref.contentType()))
                    .contentLength(length)
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .header(HttpHeaders.CONTENT_RANGE, "bytes " + start + "-" + end + "/" + size)
                    .cacheControl(cache)
                    .body(new InputStreamResource(in));
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(ref.contentType()))
                .contentLength(size)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .cacheControl(cache)
                .body(new InputStreamResource(store.open(ref.key(), 0, -1)));
    }

    private boolean canRead(Asset asset, FolyoPrincipal principal) {
        if (principal != null && asset.ownerId().equals(principal.userId())) {
            return true;
        }
        AssetRepository.Attachment attachment = assets.attachmentOf(asset.id());
        if (attachment.postId() != null) {
            return posts.canSeePost(attachment.postId(), principal);
        }
        if (attachment.conversationId() != null) {
            return principal != null && chats.isMember(attachment.conversationId(), principal.userId());
        }
        return false;
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Dosya bulunamadı");
    }
}
