package app.folyo.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * IP basina dakikalik istek siniri. Tek instance calisildigi icin sayaclar bellektedir. Amac kotuye kullanimi
 * (sayac sisirme, oturum/kayit sisirme, saglayici kotasini tuketme) durdurmaktir; normal kullanim sinira yaklasmaz.
 * IP, proxy (Caddy) tarafindan yazilan X-Forwarded-For'dan gelir; API dogrudan disariya acilmaz.
 * Herkese acik okumalar (profil, defter, aktivite) sinirlanmaz: bunlari Next.js sunucusu tek bir ic IP'den cagirir,
 * sinirlamak yogun saatte gercek ziyaretcilerin sayfasini bozardi.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
@ConditionalOnProperty(name = "folyo.rate-limit.enabled", havingValue = "true", matchIfMissing = true)
public class RateLimitFilter extends OncePerRequestFilter {

    record Rule(String name, HttpMethod method, String pattern, int perMinute) {
    }

    static final List<Rule> RULES = List.of(
            new Rule("beacon", HttpMethod.POST, "/api/public/**", 60),
            new Rule("live", HttpMethod.GET, "/api/public/cards/*/live", 120),
            new Rule("oauth", HttpMethod.GET, "/oauth2/authorization/**", 20),
            new Rule("mobile-token", HttpMethod.POST, "/api/mobile/**", 20),
            new Rule("guestbook", HttpMethod.POST, "/api/profiles/*/guestbook", 10),
            new Rule("message", HttpMethod.POST, "/api/profiles/*/messages", 10),
            new Rule("verification", HttpMethod.POST, "/api/me/verification/**", 10),
            new Rule("admin-test", HttpMethod.POST, "/api/admin/settings/*/test", 5),
            new Rule("upload", HttpMethod.POST, "/api/me/cards/*/media", 30),
            new Rule("asset-upload", HttpMethod.POST, "/api/me/assets/**", 30),
            new Rule("chat-send", HttpMethod.POST, "/api/me/conversations/*/messages", 60),
            new Rule("post", HttpMethod.POST, "/api/me/posts", 30),
            new Rule("write", null, "/api/me/**", 120));

    private static final AntPathMatcher PATHS = new AntPathMatcher();

    private final Cache<String, AtomicInteger> counters = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(2))
            .maximumSize(200_000)
            .build();
    private final Clock clock;

    public RateLimitFilter() {
        this(Clock.systemUTC());
    }

    RateLimitFilter(Clock clock) {
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Rule rule = match(request);
        if (rule != null) {
            long minute = clock.millis() / 60_000;
            String key = rule.name() + '|' + request.getRemoteAddr() + '|' + minute;
            int count = counters.get(key, k -> new AtomicInteger()).incrementAndGet();
            if (count > rule.perMinute()) {
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setHeader("Retry-After", String.valueOf(60 - (clock.millis() / 1000) % 60));
                response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                response.setCharacterEncoding("UTF-8");
                response.getWriter().write(
                        "{\"status\":429,\"title\":\"Too Many Requests\",\"detail\":\"Çok fazla istek, biraz sonra tekrar dene\"}");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    /** Ilk eslesen kural uygulanir; "write" kurali yalniz okuma disi isteklere bakar. */
    static Rule match(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        for (Rule rule : RULES) {
            boolean methodMatches = rule.method() == null
                    ? !HttpMethod.GET.matches(method) && !HttpMethod.HEAD.matches(method) && !HttpMethod.OPTIONS.matches(method)
                    : rule.method().matches(method);
            if (methodMatches && PATHS.match(rule.pattern(), path)) {
                return rule;
            }
        }
        return null;
    }
}
