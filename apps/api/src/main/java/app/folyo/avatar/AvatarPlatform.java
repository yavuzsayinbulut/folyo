package app.folyo.avatar;

import java.awt.Color;
import java.net.URI;
import java.util.List;
import java.util.Locale;

/**
 * Otomatik gorselde kullanilan platformlar: marka renkleri ve soyut bir motif (logo kullanilmaz). Web'deki
 * lib/platforms.tsx ile ayni alan adlari.
 */
public enum AvatarPlatform {
    INSTAGRAM("Instagram", Motif.PHOTO, List.of("instagram.com"), "#F58529", "#DD2A7B", "#8134AF"),
    X("X", Motif.SOCIAL, List.of("x.com", "twitter.com"), "#14171A", "#3A3F44"),
    LINKEDIN("LinkedIn", Motif.SOCIAL, List.of("linkedin.com"), "#0A66C2"),
    GITHUB("GitHub", Motif.CODE, List.of("github.com"), "#24292F", "#57606A"),
    GITLAB("GitLab", Motif.CODE, List.of("gitlab.com"), "#FC6D26", "#E24329"),
    SPOTIFY("Spotify", Motif.MUSIC, List.of("open.spotify.com", "spotify.com"), "#1DB954", "#0B6E33"),
    VSCO("VSCO", Motif.PHOTO, List.of("vsco.co"), "#3A3A3A"),
    REDDIT("Reddit", Motif.SOCIAL, List.of("reddit.com"), "#FF4500"),
    FACEBOOK("Facebook", Motif.SOCIAL, List.of("facebook.com", "fb.com"), "#1877F2"),
    YOUTUBE("YouTube", Motif.VIDEO, List.of("youtube.com", "youtu.be"), "#FF0033"),
    TIKTOK("TikTok", Motif.VIDEO, List.of("tiktok.com"), "#FE2C55", "#25F4EE"),
    STRAVA("Strava", Motif.SPORT, List.of("strava.com"), "#FC4C02"),
    MEDIUM("Medium", Motif.SOCIAL, List.of("medium.com"), "#1A1A1A"),
    SUBSTACK("Substack", Motif.SOCIAL, List.of("substack.com"), "#FF6719"),
    BEHANCE("Behance", Motif.PHOTO, List.of("behance.net"), "#1769FF"),
    DRIBBBLE("Dribbble", Motif.PHOTO, List.of("dribbble.com"), "#EA4C89"),
    TWITCH("Twitch", Motif.VIDEO, List.of("twitch.tv"), "#9146FF"),
    BLUESKY("Bluesky", Motif.SOCIAL, List.of("bsky.app"), "#1185FE"),
    THREADS("Threads", Motif.SOCIAL, List.of("threads.net", "threads.com"), "#101010"),
    DISCORD("Discord", Motif.SOCIAL, List.of("discord.gg", "discord.com"), "#5865F2"),
    MASTODON("Mastodon", Motif.SOCIAL, List.of("mastodon.social"), "#6364FF"),
    PINTEREST("Pinterest", Motif.PHOTO, List.of("pinterest.com"), "#E60023"),
    SOUNDCLOUD("SoundCloud", Motif.MUSIC, List.of("soundcloud.com"), "#FF5500"),
    STACKOVERFLOW("Stack Overflow", Motif.CODE, List.of("stackoverflow.com"), "#F48024"),
    LETTERBOXD("Letterboxd", Motif.VIDEO, List.of("letterboxd.com", "boxd.it"), "#00C030", "#40BCF4"),
    LASTFM("Last.fm", Motif.MUSIC, List.of(), "#D51007"),
    GALLERY("Galeri", Motif.PHOTO, List.of(), "#534AB7"),
    WEB("Web", Motif.WEB, List.of(), "#534AB7");

    /** Platformun soyut simgesi. */
    public enum Motif {
        MUSIC, PHOTO, CODE, SPORT, VIDEO, SOCIAL, WEB
    }

    private final String displayName;
    private final Motif motif;
    private final List<String> hosts;
    private final List<Color> colors;

    AvatarPlatform(String displayName, Motif motif, List<String> hosts, String... colors) {
        this.displayName = displayName;
        this.motif = motif;
        this.hosts = hosts;
        this.colors = java.util.Arrays.stream(colors).map(Color::decode).toList();
    }

    public String displayName() {
        return displayName;
    }

    public Motif motif() {
        return motif;
    }

    public List<Color> colors() {
        return colors;
    }

    /** Baglanti kartinin adresinden platform; taninmayan site WEB. Gecersiz adres null. */
    public static AvatarPlatform forUrl(String url) {
        String host = host(url);
        if (host == null) {
            return null;
        }
        for (AvatarPlatform platform : values()) {
            for (String h : platform.hosts) {
                if (host.equals(h) || host.endsWith("." + h)) {
                    return platform;
                }
            }
        }
        return WEB;
    }

    static String host(String url) {
        try {
            String host = url == null ? null : URI.create(url.strip()).getHost();
            return host == null ? null : host.toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
