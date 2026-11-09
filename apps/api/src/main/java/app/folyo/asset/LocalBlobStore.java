package app.folyo.asset;

import app.folyo.config.FolyoProperties;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.channels.Channels;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.Collection;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Sunucu diskinde (folyo.media-dir/assets). Prod'da Docker volume'u. */
@Component
public class LocalBlobStore implements BlobStore {

    private static final Logger log = LoggerFactory.getLogger(LocalBlobStore.class);
    static final Pattern KEY = Pattern.compile("^[0-9a-f-]{36}/[a-z]+\\.(jpg|png|webp|mp4|webm)$");

    private final Path root;

    public LocalBlobStore(FolyoProperties properties) {
        this.root = Path.of(properties.mediaDir(), "assets").toAbsolutePath().normalize();
    }

    @Override
    public void put(String key, Path file, String contentType) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Path temp = Files.createTempFile(target.getParent(), "upload-", ".tmp");
            Files.copy(file, temp, StandardCopyOption.REPLACE_EXISTING);
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Dosya kaydedilemedi", e);
        }
    }

    @Override
    public void put(String key, byte[] bytes, String contentType) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Path temp = Files.createTempFile(target.getParent(), "upload-", ".tmp");
            Files.write(temp, bytes);
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Dosya kaydedilemedi", e);
        }
    }

    @Override
    public InputStream open(String key, long offset, long length) {
        try {
            FileChannel channel = FileChannel.open(resolve(key), StandardOpenOption.READ);
            channel.position(offset);
            InputStream in = Channels.newInputStream(channel);
            return length < 0 ? in : new BoundedInputStream(in, length);
        } catch (IOException e) {
            throw new UncheckedIOException("Dosya okunamadi", e);
        }
    }

    @Override
    public long size(String key) {
        try {
            return Files.size(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException("Dosya bulunamadi", e);
        }
    }

    @Override
    public void deleteQuietly(Collection<String> keys) {
        for (String key : keys) {
            try {
                Path file = resolve(key);
                Files.deleteIfExists(file);
                try (var rest = Files.list(file.getParent())) {
                    if (rest.findAny().isEmpty()) {
                        Files.deleteIfExists(file.getParent());
                    }
                }
            } catch (IOException | IllegalArgumentException e) {
                log.warn("Dosya silinemedi: {}", key, e);
            }
        }
    }

    private Path resolve(String key) {
        if (!KEY.matcher(key).matches()) {
            throw new IllegalArgumentException("Gecersiz depolama anahtari");
        }
        return root.resolve(key);
    }
}
