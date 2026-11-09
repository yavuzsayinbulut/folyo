package app.folyo.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.net.URI;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Girisi baslatan sayfaya (ornegin mobil uygulama baglama sayfasi) geri donmek icin {@code next} adresini
 * OAuth yonlendirmesi boyunca oturumda tutar. Yalniz ayni sitedeki yollar kabul edilir; acik yonlendirme olmaz.
 */
public class LoginRedirect extends OncePerRequestFilter {

    static final String ATTRIBUTE = "folyo.login.next";
    private static final String AUTHORIZATION_PATH = "/oauth2/authorization/";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(AUTHORIZATION_PATH);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String next = safePath(request.getParameter("next"));
        if (next != null) {
            request.getSession(true).setAttribute(ATTRIBUTE, next);
        } else {
            HttpSession session = request.getSession(false);
            if (session != null) {
                session.removeAttribute(ATTRIBUTE);
            }
        }
        chain.doFilter(request, response);
    }

    /** Giris tamamlaninca donulecek yol; yoksa editor. Deger bir kez kullanilir. */
    static String consume(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return "/edit";
        }
        Object next = session.getAttribute(ATTRIBUTE);
        session.removeAttribute(ATTRIBUTE);
        String path = next instanceof String value ? safePath(value) : null;
        return path != null ? path : "/edit";
    }

    /** Yalniz "/" ile baslayan, host/protokol tasimayan ve tarayicinin baska siteye cevirebilecegi karakter icermeyen yol. */
    static String safePath(String value) {
        if (value == null || value.length() > 512 || !value.startsWith("/") || value.startsWith("//")) {
            return null;
        }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\' || c < 0x20 || c == 0x7f) {
                return null;
            }
        }
        try {
            URI uri = new URI(value);
            return uri.getScheme() == null && uri.getRawAuthority() == null ? value : null;
        } catch (Exception e) {
            return null;
        }
    }
}
