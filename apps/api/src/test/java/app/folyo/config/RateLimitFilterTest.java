package app.folyo.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RateLimitFilterTest {

    private final RateLimitFilter filter = new RateLimitFilter(
            Clock.fixed(Instant.parse("2026-11-09T10:00:05Z"), ZoneOffset.UTC));

    @Test
    void blocksAnIpAfterTheLimitButNotOthers() throws Exception {
        for (int i = 0; i < 60; i++) {
            assertThat(send("POST", "/api/public/profiles/ayse/view", "10.0.0.1")).isEqualTo(204);
        }
        MockHttpServletResponse blocked = sendFull("POST", "/api/public/profiles/ayse/view", "10.0.0.1");
        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getHeader("Retry-After")).isEqualTo("55");
        assertThat(blocked.getContentAsString()).contains("Çok fazla istek");

        assertThat(send("POST", "/api/public/profiles/ayse/view", "10.0.0.2")).isEqualTo(204);
        // Farkli kural ayri sayilir; herkese acik okumalar (SSR tek IP'den gelir) sinirlanmaz.
        assertThat(send("GET", "/api/public/cards/1/live", "10.0.0.1")).isEqualTo(204);
        assertThat(RateLimitFilter.match(request("GET", "/api/public/profiles/ayse", "10.0.0.1"))).isNull();
    }

    @Test
    void picksTheMostSpecificRule() {
        assertThat(rule("GET", "/api/public/cards/1/live")).isEqualTo("live");
        assertThat(rule("POST", "/api/me/cards/1/media")).isEqualTo("upload");
        assertThat(rule("PATCH", "/api/me/cards/1")).isEqualTo("write");
        assertThat(rule("GET", "/oauth2/authorization/google")).isEqualTo("oauth");
        assertThat(rule("POST", "/api/profiles/ayse/guestbook")).isEqualTo("guestbook");
        assertThat(RateLimitFilter.match(request("GET", "/api/me/cards", "10.0.0.1"))).isNull();
        assertThat(RateLimitFilter.match(request("GET", "/actuator/health", "10.0.0.1"))).isNull();
    }

    private String rule(String method, String path) {
        return RateLimitFilter.match(request(method, path, "10.0.0.1")).name();
    }

    private int send(String method, String path, String ip) throws Exception {
        return sendFull(method, path, ip).getStatus();
    }

    private MockHttpServletResponse sendFull(String method, String path, String ip) throws Exception {
        var response = new MockHttpServletResponse();
        response.setStatus(204);
        filter.doFilter(request(method, path, ip), response, new MockFilterChain());
        return response;
    }

    private static MockHttpServletRequest request(String method, String path, String ip) {
        var request = new MockHttpServletRequest(method, path);
        request.setRequestURI(path);
        request.setRemoteAddr(ip);
        return request;
    }
}
