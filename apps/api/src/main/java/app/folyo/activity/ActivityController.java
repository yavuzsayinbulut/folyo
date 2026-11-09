package app.folyo.activity;

import app.folyo.access.Viewer;
import app.folyo.access.ViewerService;
import app.folyo.auth.FolyoPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import app.folyo.card.Card;
import app.folyo.card.CardRepository;
import app.folyo.card.CardType;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileService;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ActivityController {

    private final ProfileService profileService;
    private final CardRepository cards;
    private final ActivityEventRepository events;

    private final ViewerService viewers;

    public ActivityController(ProfileService profileService, CardRepository cards, ActivityEventRepository events,
            ViewerService viewers) {
        this.viewers = viewers;
        this.profileService = profileService;
        this.cards = cards;
        this.events = events;
    }

    public record ActivityView(UUID id, String provider, String kind, String title, String url, Instant occurredAt) {
    }

    /**
     * Yalniz bakan kisinin gorebildigi kartlarin saglayicilarinin olaylari doner; kart gizlenince ya da kitlesi
     * daralinca akistan da hemen duser. Sahip aktiviteyi kapattiysa bos liste.
     */
    @GetMapping("/api/public/profiles/{username}/activity")
    public List<ActivityView> activity(@PathVariable String username, @AuthenticationPrincipal FolyoPrincipal principal) {
        Profile profile = profileService.requireByUsername(username);
        Viewer viewer = viewers.viewer(principal, profile);
        if (!viewer.sees(profile.privacy().profile()) || !viewer.sees(profile.privacy().activity())) {
            return List.of();
        }
        Set<String> providers = cards.findByProfileIdAndVisibleTrueAndTypeIn(profile.getId(), CardType.ACTIVITY_SOURCES)
                .stream().filter(card -> viewer.sees(card.getAudience()))
                .map(Card::getType).map(CardType::name).collect(Collectors.toSet());
        if (providers.isEmpty()) {
            return List.of();
        }
        return events.findTop12ByProfileIdAndProviderInOrderByOccurredAtDesc(profile.getId(), providers).stream()
                .map(e -> new ActivityView(e.getId(), e.getProvider(), e.getKind(), e.getTitle(), e.getUrl(),
                        e.getOccurredAt()))
                .toList();
    }
}
