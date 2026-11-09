package app.folyo.media;

import app.folyo.auth.FolyoPrincipal;
import java.io.IOException;
import java.time.Duration;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class MediaController {

    private final MediaService mediaService;

    public MediaController(MediaService mediaService) {
        this.mediaService = mediaService;
    }

    @PostMapping("/api/me/cards/{cardId}/media")
    @ResponseStatus(HttpStatus.CREATED)
    public MediaService.MediaView upload(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID cardId,
            @RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bir fotoğraf seç");
        }
        if (file.getSize() > 25L * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Fotoğraf en fazla 25 MB olabilir");
        }
        return mediaService.upload(principal.userId(), cardId, file.getBytes());
    }

    @DeleteMapping("/api/me/media/{mediaId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID mediaId) {
        mediaService.delete(principal.userId(), mediaId);
    }

    /** Fotograf icerigi id'ye bagli ve degismez; tarayici bir yil onbellekte tutabilir. */
    @GetMapping("/api/public/media/{mediaId}")
    public ResponseEntity<byte[]> read(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID mediaId,
            @org.springframework.web.bind.annotation.RequestParam(required = false) String size) {
        return mediaService.read(mediaId, principal, "original".equals(size))
                .map(file -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(file.contentType()))
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable())
                        .body(file.bytes()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fotoğraf bulunamadı"));
    }
}
