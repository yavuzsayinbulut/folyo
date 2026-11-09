package app.folyo.moderation;

import app.folyo.settings.ModerationPolicy;
import app.folyo.settings.PlatformSettings;
import java.text.Normalizer;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.server.ResponseStatusException;

/**
 * Yazma kapisi: askiya alinmis hesap yazamaz, kurallari kabul etmemis kisi once kabul eder (istemci "code" alanina
 * bakip kurallari gosterir), yasakli ifade iceren metin kabul edilmez. Gonderi, yanit, sohbet ve defter buradan gecer.
 */
@Service
public class ModerationService {

    public static final String RULES_REQUIRED = "RULES_REQUIRED";
    public static final String SUSPENDED = "SUSPENDED";
    private static final Locale TR = Locale.forLanguageTag("tr");

    private final JdbcClient jdbc;
    private final PlatformSettings settings;
    private final boolean requireRules;
    private volatile CachedFilter filter = new CachedFilter(List.of(), null);

    private record CachedFilter(List<String> words, Pattern pattern) {
    }

    public ModerationService(JdbcClient jdbc, PlatformSettings settings,
            @Value("${folyo.moderation.require-rules:true}") boolean requireRules) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.requireRules = requireRules;
    }

    /** Yazmadan once: hesap askida mi, kurallar kabul edildi mi. */
    public void requireCanWrite(UUID userId) {
        record State(Instant suspendedAt, Instant rulesAcceptedAt) {
        }
        State state = jdbc.sql("select suspended_at, rules_accepted_at from users where id = :id").param("id", userId)
                .query((rs, i) -> new State(instant(rs.getTimestamp(1)), instant(rs.getTimestamp(2)))).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (state.suspendedAt() != null) {
            throw problem(HttpStatus.FORBIDDEN, SUSPENDED,
                    "Hesabın topluluk kuralları nedeniyle askıya alındı; paylaşım ve mesaj gönderemezsin");
        }
        if (requireRules && state.rulesAcceptedAt() == null) {
            throw problem(HttpStatus.FORBIDDEN, RULES_REQUIRED, "Paylaşmadan önce topluluk kurallarını kabul et");
        }
    }

    public void acceptRules(UUID userId) {
        jdbc.sql("update users set rules_accepted_at = coalesce(rules_accepted_at, now()) where id = :id")
                .param("id", userId).update();
    }

    /** Yasakli ifade iceren metin reddedilir. Buyuk/kucuk harf, aksan ve basit harf yerine rakam oyunlari yakalanir. */
    public void checkText(String... texts) {
        Pattern pattern = pattern();
        if (pattern == null) {
            return;
        }
        for (String text : texts) {
            if (text != null && pattern.matcher(normalize(text)).find()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Bu içerik topluluk kurallarına aykırı bir ifade içeriyor");
            }
        }
    }

    private Pattern pattern() {
        List<String> words = settings.moderation().words();
        CachedFilter current = filter;
        if (!current.words().equals(words)) {
            List<String> normalized = words.stream().map(ModerationService::normalize).map(String::strip)
                    .filter(w -> !w.isEmpty()).distinct().toList();
            Pattern compiled = normalized.isEmpty() ? null : Pattern.compile(
                    "(?<![\\p{L}\\p{N}])(?:" + normalized.stream().map(Pattern::quote).collect(Collectors.joining("|"))
                            + ")(?![\\p{L}\\p{N}])");
            current = new CachedFilter(words, compiled);
            filter = current;
        }
        return current.pattern();
    }

    /** "KÖTÜ Söz", "k0tu soz" ve "kötü söz" ayni bicime iner. */
    static String normalize(String text) {
        String lower = text.toLowerCase(TR).replace('ı', 'i');
        String stripped = Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        StringBuilder out = new StringBuilder(stripped.length());
        for (char c : stripped.toCharArray()) {
            out.append(switch (c) {
                case '0' -> 'o';
                case '1' -> 'i';
                case '3' -> 'e';
                case '4', '@' -> 'a';
                case '5', '$' -> 's';
                case '7' -> 't';
                default -> c;
            });
        }
        return out.toString();
    }

    ModerationPolicy policy() {
        return settings.moderation();
    }

    static ErrorResponseException problem(HttpStatus status, String code, String detail) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(status, detail);
        body.setProperty("code", code);
        return new ErrorResponseException(status, body, null);
    }

    private static Instant instant(java.sql.Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
