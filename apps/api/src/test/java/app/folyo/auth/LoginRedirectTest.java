package app.folyo.auth;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class LoginRedirectTest {

    @Test
    void acceptsOnlySameSitePaths() {
        assertThat(LoginRedirect.safePath("/edit")).isEqualTo("/edit");
        assertThat(LoginRedirect.safePath("/mobile-login?code_challenge=abc&redirect_uri=folyo%3A%2F%2Fauth"))
                .startsWith("/mobile-login?");
        assertThat(LoginRedirect.safePath(null)).isNull();
        assertThat(LoginRedirect.safePath("")).isNull();
        assertThat(LoginRedirect.safePath("edit")).isNull();
        assertThat(LoginRedirect.safePath("//evil.example")).isNull();
        assertThat(LoginRedirect.safePath("/\\evil.example")).isNull();
        assertThat(LoginRedirect.safePath("/\t/evil.example")).isNull();
        assertThat(LoginRedirect.safePath("https://evil.example/edit")).isNull();
        assertThat(LoginRedirect.safePath("/" + "a".repeat(600))).isNull();
    }

    @Test
    void remembersNextAcrossTheOAuthRedirectAndUsesItOnce() throws Exception {
        var start = new MockHttpServletRequest("GET", "/oauth2/authorization/google");
        start.setRequestURI("/oauth2/authorization/google");
        start.setParameter("next", "/ayse");
        new LoginRedirect().doFilter(start, new MockHttpServletResponse(), new MockFilterChain());

        HttpServletRequest callback = withSession(start);
        assertThat(LoginRedirect.consume(callback)).isEqualTo("/ayse");
        assertThat(LoginRedirect.consume(callback)).isEqualTo("/edit");
    }

    @Test
    void unsafeOrMissingNextFallsBackToEditor() throws Exception {
        var start = new MockHttpServletRequest("GET", "/oauth2/authorization/github");
        start.setRequestURI("/oauth2/authorization/github");
        start.setParameter("next", "//evil.example");
        new LoginRedirect().doFilter(start, new MockHttpServletResponse(), new MockFilterChain());
        assertThat(LoginRedirect.consume(withSession(start))).isEqualTo("/edit");
        assertThat(LoginRedirect.consume(new MockHttpServletRequest())).isEqualTo("/edit");
    }

    private static HttpServletRequest withSession(MockHttpServletRequest previous) {
        var next = new MockHttpServletRequest("GET", "/login/oauth2/code/google");
        if (previous.getSession(false) != null) {
            next.setSession(previous.getSession(false));
        }
        return next;
    }
}
