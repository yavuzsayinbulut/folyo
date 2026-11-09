package app.folyo.asset;

import java.io.InputStream;
import java.nio.file.Path;
import java.util.Collection;

/** Dosya deposu. Anahtarlar uygulamanin urettigi "{varlik-id}/{kopya}.{uzanti}" bicimindedir. */
public interface BlobStore {

    void put(String key, Path file, String contentType);

    void put(String key, byte[] bytes, String contentType);

    /** offset'ten itibaren length bayt (length < 0: sonuna kadar). Video icin aralikli okuma. */
    InputStream open(String key, long offset, long length);

    long size(String key);

    void deleteQuietly(Collection<String> keys);
}
