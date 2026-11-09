package app.folyo.access;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.auth.User;
import app.folyo.auth.UserRepository;
import app.folyo.profile.Profile;
import app.folyo.settings.PlatformSettings;
import app.folyo.settings.VerificationPolicy;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ViewerService {

    private final UserRepository users;
    private final PlatformSettings settings;

    public ViewerService(UserRepository users, PlatformSettings settings) {
        this.users = users;
        this.settings = settings;
    }

    public Viewer viewer(FolyoPrincipal principal, Profile profile) {
        if (principal == null) {
            return Viewer.ANONYMOUS;
        }
        boolean owner = profile != null && profile.getUserId().equals(principal.userId());
        return new Viewer(principal.userId(), status(principal.userId()).verified(), owner);
    }

    public VerificationStatus status(UUID userId) {
        VerificationPolicy policy = settings.policy();
        User user = users.findById(userId).orElse(null);
        boolean email = user != null && user.getEmailVerifiedAt() != null;
        boolean phone = user != null && user.getPhoneVerifiedAt() != null;
        return new VerificationStatus(email, phone, policy.requireEmail(), policy.requirePhone());
    }
}
