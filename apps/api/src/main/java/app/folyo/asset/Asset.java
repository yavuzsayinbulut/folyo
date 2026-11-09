package app.folyo.asset;

import app.folyo.settings.StorageSettings;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Bir medya kaydi. storageKey orijinali, variants kucuk kopyalari (thumb, large, poster, avatar, sticker) gosterir. */
public record Asset(UUID id, UUID ownerId, AssetKind kind, StorageSettings.Provider store, String contentType,
        long byteSize, Integer width, Integer height, Integer durationMs, String storageKey,
        Map<String, VariantRef> variants, Instant attachedAt, Instant createdAt) {

    public record VariantRef(String key, String contentType, int width, int height) {
    }

    /** Istenen kopya yoksa orijinal sunulur. */
    public VariantRef variant(String name) {
        VariantRef ref = variants.get(name);
        if (ref != null) {
            return ref;
        }
        return new VariantRef(storageKey, contentType, width == null ? 0 : width, height == null ? 0 : height);
    }
}
