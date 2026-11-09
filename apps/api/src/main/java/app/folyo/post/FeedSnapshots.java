package app.folyo.post;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Siralanmis "Senin icin" listesi sayfalama boyunca sabit tutulur: puanlar begeni geldikce degisse de asagi kaydiran
 * kisi ayni gonderiyi iki kez gormez, araya giren gonderiyi kacirmaz. Liste yalniz kimliklerdir; her sayfada gorunurluk
 * yeniden kontrol edilir. Tek sunucu varsayilir; liste dusmusse (sure doldu, yeniden baslatma) yeniden siralanir.
 */
@Configuration
@EnableConfigurationProperties(FeedProperties.class)
class FeedSnapshots {

    record Snapshot(UUID viewerId, List<UUID> ids) {
    }

    private final SecureRandom random = new SecureRandom();
    private final Cache<String, Snapshot> cache;

    FeedSnapshots(FeedProperties properties) {
        this.cache = Caffeine.newBuilder()
                .expireAfterAccess(properties.snapshotTtl())
                .maximumSize(properties.maxSnapshots())
                .build();
    }

    String save(UUID viewerId, List<UUID> ids) {
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        cache.put(token, new Snapshot(viewerId, List.copyOf(ids)));
        return token;
    }

    /** Baskasinin akis imleci kullanilamaz. */
    Optional<Snapshot> find(String token, UUID viewerId) {
        return Optional.ofNullable(cache.getIfPresent(token)).filter(s -> Objects.equals(s.viewerId(), viewerId));
    }
}
