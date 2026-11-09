package app.folyo.avatar;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.auth.User;
import app.folyo.auth.UserRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class AvatarController {

    private final UserRepository users;
    private final AutoAvatarService autoAvatars;

    public AvatarController(UserRepository users, AutoAvatarService autoAvatars) {
        this.users = users;
        this.autoAvatars = autoAvatars;
    }

    /** source: SPOTIFY | STRAVA | GENERATED; platforms: gorselin dayandigi platformlar (kart sirasiyla). */
    public record AutoView(String url, String source, List<String> platforms) {
    }

    /**
     * avatarUrl: herkesin gordugu fotograf. Oncelik: yuklenen > otomatik > giris hesabinin fotografi.
     * auto: yuklenen fotograf kaldirilirsa gorunecek otomatik gorsel (yoksa null).
     */
    public record AvatarStatus(String avatarUrl, String uploadedUrl, AutoView auto, String accountUrl) {
    }

    @GetMapping("/api/me/avatar")
    public AvatarStatus status(@AuthenticationPrincipal FolyoPrincipal principal) {
        User user = users.findById(principal.userId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        AutoView auto = user.getAutoAvatarAssetId() == null ? null
                : new AutoView(url(user.getAutoAvatarAssetId()), user.getAutoAvatarSource(),
                        autoAvatars.platforms(user).stream().map(AvatarPlatform::displayName).toList());
        return new AvatarStatus(user.getAvatarUrl(),
                user.getAvatarAssetId() == null ? null : url(user.getAvatarAssetId()), auto, user.getProviderAvatarUrl());
    }

    private static String url(UUID assetId) {
        return "/api/public/assets/" + assetId + "/avatar";
    }
}
