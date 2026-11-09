package app.folyo.asset;

import java.util.UUID;

/**
 * Istemcinin gordugu medya. url: orijinal kalite; thumbUrl/largeUrl: listelerde hizli acilan kopyalar;
 * posterUrl: videonun kapagi. Adresler ayni sitededir; yetki kontrolu her istekte yapilir.
 */
public record AssetView(UUID id, AssetKind kind, String contentType, Integer width, Integer height, Integer durationMs,
        String url, String thumbUrl, String largeUrl, String posterUrl) {

    public static String url(UUID id, String variant) {
        return "/api/public/assets/" + id + "/" + variant;
    }

    public static AssetView from(Asset a) {
        String poster = a.variants().containsKey("poster") ? url(a.id(), "poster") : null;
        return new AssetView(a.id(), a.kind(), a.contentType(), a.width(), a.height(), a.durationMs(),
                url(a.id(), "original"),
                a.variants().containsKey("thumb") ? url(a.id(), "thumb") : (poster != null ? poster : url(a.id(), "original")),
                a.variants().containsKey("large") ? url(a.id(), "large") : url(a.id(), "original"),
                poster);
    }
}
