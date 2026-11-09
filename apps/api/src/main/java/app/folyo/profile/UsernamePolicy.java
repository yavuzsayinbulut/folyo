package app.folyo.profile;

import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/** Kullanici adi kurallari. Veritabanindaki ck_profiles_username kontrolu ile ayni deseni kullanir. */
public final class UsernamePolicy {

    private static final Pattern PATTERN = Pattern.compile("^[a-z0-9_.]{3,20}$");

    /** Web'deki sabit rotalar ve ileride kullanilacak sistem adlari kullaniciya verilmez. */
    private static final Set<String> RESERVED = Set.of(
            "about", "admin", "api", "app", "assets", "blog", "dashboard", "dev", "edit", "explore", "folyo",
            "help", "home", "login", "logout", "me", "new", "oauth2", "privacy", "public", "settings", "signup",
            "static", "support", "terms", "www", "_next", "actuator", "gizlilik", "kosullar", "mobile-login",
            "robots.txt", "sitemap.xml", "favicon.ico", "icon.png", "apple-icon.png", "manifest.json",
            "manifest.webmanifest", "opengraph-image", "twitter-image");

    /** Web'in dosya adlariyla cakismasin: bilinen dosya uzantisiyla biten ad verilmez (icon.png, robots.txt...). */
    private static final Pattern FILE_LIKE = Pattern.compile(
            ".*\\.(png|jpe?g|gif|webp|svg|ico|txt|xml|json|webmanifest|js|css|map|html?|pdf)$");

    private UsernamePolicy() {
    }

    public static String normalize(String raw) {
        return raw == null ? "" : raw.strip().toLowerCase(Locale.ROOT);
    }

    /** Kural ihlali varsa kullaniciya gosterilecek aciklamayi doner. */
    public static Optional<String> violation(String username) {
        if (!PATTERN.matcher(username).matches()) {
            return Optional.of("3-20 karakter: küçük harf, rakam, nokta veya alt çizgi");
        }
        if (username.startsWith(".") || username.endsWith(".") || username.contains("..")) {
            return Optional.of("Nokta başta, sonda veya art arda olamaz");
        }
        if (RESERVED.contains(username) || FILE_LIKE.matcher(username).matches()) {
            return Optional.of("Bu ad sistem için ayrılmış");
        }
        return Optional.empty();
    }
}
