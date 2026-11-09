package app.folyo.avatar;

import app.folyo.access.Audience;
import app.folyo.asset.AssetService;
import app.folyo.auth.User;
import app.folyo.auth.UserRepository;
import app.folyo.card.Card;
import app.folyo.card.CardRepository;
import app.folyo.connection.ConnectionProvider;
import app.folyo.connection.ConnectionService;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileService;
import app.folyo.provider.SpotifyClient;
import app.folyo.provider.StravaClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * Otomatik profil gorseli. Sayfadaki herkese acik kartlardan bagli platformlar okunur (kart sirasiyla):
 * OAuth ile baglanmis (sahipligi dogrulanmis) hesapta gercek fotograf varsa (Spotify, Strava) o kullanilir, yoksa
 * platformlardan ozgun gorsel uretilir. Adres ya da kullanici adiyla eklenen kartlar (GitHub, Instagram...) kisinin
 * kendisine ait oldugu kanitlanmadigi icin fotograf kaynagi olmaz; yoksa biri baskasinin fotografini alabilirdi. Kisinin yukledigi fotograf her zaman onceliklidir; hic platform yoksa giris hesabinin fotografi kalir.
 * Girdiler (platformlar, bas harfler, foto kaynaklari) degismedikce gorsel yeniden uretilmez.
 */
@Service
public class AutoAvatarService {

    private static final Logger log = LoggerFactory.getLogger(AutoAvatarService.class);
    /** Cizim ya da kural degisirse artirilir; tum gorseller kademeli olarak yeniden uretilir. */
    static final String VERSION = "1";
    static final String KEY_PREFIX = "v" + VERSION + ":";
    static final Duration RETRY = Duration.ofHours(6);
    static final int MAX_PLATFORMS = 3;

    public enum Source {
        SPOTIFY, STRAVA, GENERATED
    }

    /** Gercek fotografin alinabilecegi, OAuth ile bagli hesap (kart sirasiyla). */
    record PhotoSource(Source source) {
    }

    record Inputs(String initials, List<AvatarPlatform> platforms, List<PhotoSource> sources) {

        /** "v1:<ozet>": surum oneki sayesinde surum artinca eski gorseller arka planda yeniden uretilir. */
        String key() {
            String raw = initials + "|" + platforms + "|" + sources;
            try {
                String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
                return KEY_PREFIX + digest.substring(0, 56);
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    private final UserRepository users;
    private final ProfileService profiles;
    private final CardRepository cards;
    private final ConnectionService connections;
    private final SpotifyClient spotify;
    private final StravaClient strava;
    private final RemoteImages remote;
    private final AssetService assets;
    private final TransactionTemplate transaction;
    private final Object[] locks = new Object[64];

    public AutoAvatarService(UserRepository users, ProfileService profiles, CardRepository cards,
            ConnectionService connections, SpotifyClient spotify, StravaClient strava, RemoteImages remote, AssetService assets, PlatformTransactionManager transactionManager) {
        this.users = users;
        this.profiles = profiles;
        this.cards = cards;
        this.connections = connections;
        this.spotify = spotify;
        this.strava = strava;
        this.remote = remote;
        this.assets = assets;
        this.transaction = new TransactionTemplate(transactionManager);
        for (int i = 0; i < locks.length; i++) {
            locks[i] = new Object();
        }
    }

    /** Kart, baglanti ya da ad degisince commit sonrasi arka planda; istegi bekletmez. */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onInputsChanged(AvatarInputsChanged event) {
        refreshQuietly(event.userId());
    }

    /** Hic hesaplanmamis (eski kullanicilar), eski surumle uretilmis ve yeniden denemesi gelmis gorseller. */
    @Scheduled(fixedDelayString = "${folyo.avatar.refresh-interval:PT15M}",
            initialDelayString = "${folyo.avatar.refresh-initial-delay:PT1M}")
    void refreshPending() {
        for (UUID userId : users.autoAvatarPending(KEY_PREFIX + "%", 50)) {
            refreshQuietly(userId);
        }
    }

    private void refreshQuietly(UUID userId) {
        try {
            refresh(userId);
        } catch (RuntimeException e) {
            log.warn("Otomatik profil görseli üretilemedi: {}", userId, e);
        }
    }

    /** Ayni kisi icin es zamanli iki hesap siraya girer; farkli kisiler paralel calisir. */
    public void refresh(UUID userId) {
        synchronized (locks[Math.floorMod(userId.hashCode(), locks.length)]) {
            User user = users.findById(userId).orElse(null);
            if (user == null) {
                return;
            }
            Inputs inputs = inputs(user);
            String key = inputs.key();
            Instant retryAt = user.getAutoAvatarRetryAt();
            boolean retryDue = retryAt != null && !retryAt.isAfter(Instant.now());
            if (key.equals(user.getAutoAvatarKey()) && !retryDue) {
                return;
            }
            if (inputs.platforms().isEmpty()) {
                assets.setAutoAvatar(userId, null, null, key, null);
                return;
            }
            boolean temporaryFailure = false;
            for (PhotoSource source : inputs.sources()) {
                try {
                    String url = photoUrl(user, source);
                    if (url != null) {
                        assets.setAutoAvatar(userId, remote.download(url), source.source().name(), key, null);
                        return;
                    }
                } catch (RemoteImages.Unavailable | app.folyo.provider.ProviderUnavailableException e) {
                    temporaryFailure = true;
                } catch (RemoteImages.Rejected | app.folyo.provider.AuthorizationRevokedException
                         | app.folyo.provider.AccountNotFoundException | app.folyo.provider.ProviderNotConfiguredException
                         | app.folyo.connection.ConnectionMissingException | ResponseStatusException e) {
                    // Bu kaynaktan fotograf yok (izin geri alinmis, hesap yok, gecersiz gorsel): siradakine gecilir.
                    log.debug("Fotoğraf kaynağı atlandı: {} {}", source.source(), e.getMessage());
                }
            }
            Instant nextTry = temporaryFailure ? Instant.now().plus(RETRY) : null;
            if (key.equals(user.getAutoAvatarKey()) && Source.GENERATED.name().equals(user.getAutoAvatarSource())) {
                // Ayni girdilerle uretilmis gorsel zaten var; yalniz yeniden deneme zamani tasinir.
                transaction.executeWithoutResult(status -> users.markAutoAvatar(userId, key, nextTry));
                return;
            }
            byte[] art = AvatarArt.render(inputs.initials(), inputs.platforms(), userId.getMostSignificantBits());
            assets.setAutoAvatar(userId, art, Source.GENERATED.name(), key, nextTry);
        }
    }

    /** Editorde gosterilecek bilgi: hangi platformlar kullaniliyor. */
    public List<AvatarPlatform> platforms(User user) {
        return inputs(user).platforms();
    }

    Inputs inputs(User user) {
        Profile profile = profiles.findByUserId(user.getId()).orElse(null);
        String initials = AvatarArt.initials(profile != null ? profile.getDisplayName() : user.getName());
        if (profile == null) {
            return new Inputs(initials, List.of(), List.of());
        }
        Set<AvatarPlatform> platforms = new LinkedHashSet<>();
        Set<PhotoSource> sources = new LinkedHashSet<>();
        // Yalniz herkese acik ve gorunur kartlar: gorsel herkese acik, gizli kartin platformu ondan anlasilmasin.
        for (Card card : cards.findByProfileIdAndVisibleTrueOrderByPosition(profile.getId())) {
            if (card.getAudience() != Audience.EVERYONE) {
                continue;
            }
            Object rawUrl = card.getConfig().get("url");
            switch (card.getType()) {
                case LINK -> {
                    AvatarPlatform platform = AvatarPlatform.forUrl(rawUrl == null ? null : rawUrl.toString());
                    if (platform != null) {
                        platforms.add(platform);
                    }
                }
                case GITHUB -> platforms.add(AvatarPlatform.GITHUB);
                case SPOTIFY -> {
                    platforms.add(AvatarPlatform.SPOTIFY);
                    if (connections.isActive(profile.getId(), ConnectionProvider.SPOTIFY)) {
                        sources.add(new PhotoSource(Source.SPOTIFY));
                    }
                }
                case STRAVA -> {
                    platforms.add(AvatarPlatform.STRAVA);
                    if (connections.isActive(profile.getId(), ConnectionProvider.STRAVA)) {
                        sources.add(new PhotoSource(Source.STRAVA));
                    }
                }
                case LASTFM -> platforms.add(AvatarPlatform.LASTFM);
                case REDDIT -> platforms.add(AvatarPlatform.REDDIT);
                case GALLERY -> platforms.add(AvatarPlatform.GALLERY);
                case TEXT -> {
                }
            }
        }
        return new Inputs(initials, platforms.stream().limit(MAX_PLATFORMS).toList(), new ArrayList<>(sources));
    }

    private String photoUrl(User user, PhotoSource source) {
        UUID profileId = profiles.findByUserId(user.getId()).map(Profile::getId).orElseThrow();
        return switch (source.source()) {
            case SPOTIFY -> spotify.profileImage(connections.accessToken(profileId, ConnectionProvider.SPOTIFY));
            case STRAVA -> strava.profileImage(connections.accessToken(profileId, ConnectionProvider.STRAVA));
            case GENERATED -> null;
        };
    }
}
