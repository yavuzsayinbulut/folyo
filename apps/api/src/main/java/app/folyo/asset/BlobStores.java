package app.folyo.asset;

import app.folyo.settings.PlatformSettings;
import app.folyo.settings.SettingsSecrets;
import app.folyo.settings.StorageSettings;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/**
 * Yeni dosyalar admin'in sectigi depoya yazilir; her varlik hangi depoda oldugunu kaydeder ve oradan okunur.
 * S3 istemcisi ayarlar degisene kadar yeniden kullanilir.
 */
@Component
public class BlobStores {

    private final LocalBlobStore local;
    private final PlatformSettings settings;
    private final SettingsSecrets secrets;
    private final AtomicReference<CachedS3> s3 = new AtomicReference<>();

    private record CachedS3(StorageSettings.S3 settings, S3BlobStore store) {
    }

    public BlobStores(LocalBlobStore local, PlatformSettings settings, SettingsSecrets secrets) {
        this.local = local;
        this.settings = settings;
        this.secrets = secrets;
    }

    /** Yeni yuklemelerin gidecegi depo. */
    public StorageSettings.Provider current() {
        StorageSettings storage = settings.storage();
        return storage.provider() == StorageSettings.Provider.S3 && storage.s3() != null
                ? StorageSettings.Provider.S3 : StorageSettings.Provider.LOCAL;
    }

    public BlobStore get(StorageSettings.Provider provider) {
        if (provider == StorageSettings.Provider.LOCAL) {
            return local;
        }
        StorageSettings.S3 config = settings.storage().s3();
        if (config == null) {
            throw new IllegalStateException("S3 deposu yapilandirilmamis");
        }
        CachedS3 cached = s3.get();
        if (cached == null || !cached.settings().equals(config)) {
            S3BlobStore store = new S3BlobStore(config, secrets.open(config.secretKeyEnc()));
            CachedS3 previous = s3.getAndSet(new CachedS3(config, store));
            if (previous != null) {
                previous.store().close();
            }
            return store;
        }
        return cached.store();
    }

    /** Admin'in girdigi ayarlarla gecici bir istemci (kaydetmeden once deneme icin). */
    public BlobStore probe(StorageSettings.S3 config, String secretKey) {
        return new S3BlobStore(config, secretKey);
    }
}
