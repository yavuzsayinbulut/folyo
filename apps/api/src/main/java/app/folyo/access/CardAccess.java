package app.folyo.access;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.card.Card;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileRepository;
import org.springframework.stereotype.Component;

/** Tek bir kartin (canli veri, galeri fotografi) bakan kisiye gosterilip gosterilemeyecegi. */
@Component
public class CardAccess {

    private final ProfileRepository profiles;
    private final ViewerService viewers;

    public CardAccess(ProfileRepository profiles, ViewerService viewers) {
        this.profiles = profiles;
        this.viewers = viewers;
    }

    public boolean canSee(Card card, FolyoPrincipal principal) {
        Profile profile = profiles.findById(card.getProfileId()).orElse(null);
        if (profile == null) {
            return false;
        }
        Viewer viewer = viewers.viewer(principal, profile);
        if (viewer.owner()) {
            return true;
        }
        return card.isVisible() && viewer.sees(profile.privacy().profile()) && viewer.sees(card.getAudience());
    }
}
