package app.folyo.page;

import app.folyo.access.Audience;
import app.folyo.access.Interaction;
import app.folyo.access.InteractionPolicy;
import app.folyo.access.Viewer;
import app.folyo.access.ViewerService;
import app.folyo.auth.FolyoPrincipal;
import app.folyo.auth.User;
import app.folyo.auth.UserRepository;
import app.folyo.card.Card;
import app.folyo.card.CardService;
import app.folyo.card.CardView;
import app.folyo.media.MediaService;
import app.folyo.message.BlockRepository;
import app.folyo.profile.PrivacySettings;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileAccent;
import app.folyo.profile.ProfileService;
import app.folyo.profile.ProfileTheme;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Ziyaretcinin gordugu sayfanin verisi. Icerik bakan kisiye gore suzulur: sahibin gizlilik secimlerine gore
 * bolumler (konum, saat, aktivite, defter) ve kartlar ya hic gelmez ya da yalniz izinli kitleye gelir.
 */
@RestController
public class PublicPageController {

    private final ProfileService profileService;
    private final CardService cardService;
    private final UserRepository users;
    private final MediaService mediaService;
    private final ViewerService viewers;
    private final BlockRepository blocks;

    public PublicPageController(ProfileService profileService, CardService cardService, UserRepository users,
            MediaService mediaService, ViewerService viewers, BlockRepository blocks) {
        this.profileService = profileService;
        this.cardService = cardService;
        this.users = users;
        this.mediaService = mediaService;
        this.viewers = viewers;
        this.blocks = blocks;
    }

    /** Ziyaretcinin yapabilecekleri; arayuz "giris yap / dogrula / kapali" durumlarini buna gore gosterir. */
    public record Interactions(Interaction comment, boolean commentNeedsApproval, Interaction message,
            boolean guestbookVisible, boolean activityVisible) {
    }

    public record PublicPage(String username, String displayName, String bio, String location, String timezone,
            String status, String avatarUrl, boolean indexable, ProfileTheme theme, ProfileAccent accent,
            List<CardView> cards, Interactions interactions) {
    }

    /** Sayfa yalniz giris yapanlara ya da dogrulanmislara aciksa: kim oldugu degil, ne gerektigi soylenir. */
    public record RestrictedPage(String username, Audience requirement) {
    }

    @GetMapping("/api/public/profiles/{username}")
    public ResponseEntity<?> page(@PathVariable String username, @AuthenticationPrincipal FolyoPrincipal principal) {
        Profile profile = profileService.requireByUsername(username);
        PrivacySettings privacy = profile.privacy();
        Viewer viewer = viewers.viewer(principal, profile);
        if (!viewer.sees(privacy.profile())) {
            if (privacy.profile() == Audience.ONLY_ME) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profil bulunamadı");
            }
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new RestrictedPage(profile.getUsername(), privacy.profile()));
        }
        String avatarUrl = users.findById(profile.getUserId()).map(User::getAvatarUrl).orElse(null);
        List<Card> visible = cardService.visibleCards(profile.getId()).stream()
                .filter(card -> viewer.sees(card.getAudience())).toList();
        List<CardView> cards = CardView.fromAll(visible, mediaService.viewsByCard(visible));
        boolean blocked = viewer.signedIn() && !viewer.owner()
                && blocks.isBlocked(profile.getUserId(), viewer.userId());
        var interactions = new Interactions(viewer.interaction(privacy.comments(), blocked),
                privacy.comments() == InteractionPolicy.APPROVAL, viewer.interaction(privacy.messages(), blocked),
                viewer.sees(privacy.guestbook()), viewer.sees(privacy.activity()));
        boolean indexable = privacy.indexable() && privacy.profile() == Audience.EVERYONE;
        return ResponseEntity.ok(new PublicPage(profile.getUsername(), profile.getDisplayName(), profile.getBio(),
                viewer.sees(privacy.location()) ? profile.getLocation() : null,
                viewer.sees(privacy.localTime()) ? profile.getTimezone() : null,
                profile.getStatus(), avatarUrl, indexable, profile.getTheme(), profile.getAccent(), cards,
                interactions));
    }

    @GetMapping("/api/usernames/{username}/availability")
    public ProfileService.Availability availability(@PathVariable String username) {
        return profileService.availability(username);
    }
}
