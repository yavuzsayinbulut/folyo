package app.folyo.auth;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserRepository users;
    private final Set<String> adminEmails;

    public UserService(UserRepository users, @Value("${folyo.admin.emails:}") String adminEmails) {
        this.users = users;
        this.adminEmails = Arrays.stream(adminEmails.split(",")).map(String::strip).filter(e -> !e.isEmpty())
                .map(e -> e.toLowerCase(Locale.ROOT)).collect(Collectors.toUnmodifiableSet());
    }

    /** E-postasi saglayici tarafindan dogrulanmamis giris (dev, testler). */
    @Transactional
    public User signIn(String provider, String subject, String email, String name, String avatarUrl) {
        return signIn(provider, subject, email, false, name, avatarUrl);
    }

    @Transactional
    public User signIn(String provider, String subject, String email, boolean emailVerified, String name,
            String avatarUrl) {
        String safeName = truncate(name == null || name.isBlank() ? subject : name.strip(), 100);
        String safeEmail = email == null || email.isBlank() ? null : email.strip();
        users.upsert(UUID.randomUUID(), provider, subject, safeEmail, safeEmail != null && emailVerified, safeName,
                avatarUrl);
        User user = users.findByAuthProviderAndAuthSubject(provider, subject).orElseThrow();
        return refreshRole(user.getId());
    }

    /**
     * Admin rolu ortamdaki FOLYO_ADMIN_EMAILS listesinden gelir ve yalniz dogrulanmis e-postaya verilir.
     * Listeden cikarilan kisi bir sonraki giriste ya da e-posta dogrulamasinda kullaniciya doner.
     */
    @Transactional
    public User refreshRole(UUID userId) {
        User user = users.findById(userId).orElseThrow();
        boolean admin = isAdmin(user);
        if (admin != user.isAdmin()) {
            users.setRole(userId, admin ? "ADMIN" : "USER");
            user = users.findById(userId).orElseThrow();
        }
        return user;
    }

    /**
     * Yetki her istekte ortamdaki listeye gore hesaplanir: listeden cikarilan kisi oturumu ya da mobil token'i
     * suresini doldurmadan da yoneticilikten duser.
     */
    public boolean isAdmin(User user) {
        return user.getEmailVerifiedAt() != null && user.getEmail() != null
                && adminEmails.contains(user.getEmail().toLowerCase(Locale.ROOT));
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
