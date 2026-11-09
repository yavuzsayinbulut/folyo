package app.folyo.avatar;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Bagli hesaptaki profil fotografini indirir. Adres saglayicinin API'sinden gelse de yalniz bilinen fotograf
 * sunucularina (https) gidilir, yonlendirme izlenmez ve boyut sinirlidir: sunucu, ic aga ya da rastgele bir
 * adrese istek atmaya kandirilamaz. Fotograf bir kez indirilip kendi depomuzda saklanir; ziyaretci ucuncu tarafa gitmez.
 */
@Component
public class RemoteImages {

    static final long MAX_BYTES = 5L * 1024 * 1024;

    /** Spotify ve Strava (CloudFront; Google/Facebook ile acilmis Strava hesaplarinda o sunucular). */
    private static final List<String> HOSTS = List.of("scdn.co", "spotifycdn.com", "cloudfront.net",
            "googleusercontent.com", "fbcdn.net");

    /** Kalici: bu adresten fotograf alinamaz (yeniden denemeye degmez). */
    public static class Rejected extends RuntimeException {
        Rejected(String message) {
            super(message);
        }
    }

    /** Gecici: ag ya da sunucu hatasi; daha sonra yeniden denenir. */
    public static class Unavailable extends RuntimeException {
        public Unavailable(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public byte[] download(String url) {
        URI uri = allowed(url);
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).GET().build();
        try {
            HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                int status = response.statusCode();
                if (status >= 500 || status == 429) {
                    throw new Unavailable("Fotoğraf sunucusu yanıt vermedi: " + status, null);
                }
                if (status != 200) {
                    throw new Rejected("Fotoğraf alınamadı: " + status);
                }
                byte[] bytes = body.readNBytes((int) MAX_BYTES + 1);
                if (bytes.length > MAX_BYTES) {
                    throw new Rejected("Fotoğraf çok büyük");
                }
                return bytes;
            }
        } catch (IOException e) {
            throw new Unavailable("Fotoğraf indirilemedi", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Unavailable("Fotoğraf indirme yarıda kaldı", e);
        }
    }

    static URI allowed(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new Rejected("Geçersiz adres");
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.ROOT);
        boolean known = HOSTS.stream().anyMatch(h -> host.equals(h) || host.endsWith("." + h));
        if (!"https".equals(uri.getScheme()) || uri.getPort() != -1 || !known) {
            throw new Rejected("İzin verilmeyen fotoğraf adresi");
        }
        return uri;
    }
}
