package app.folyo.asset;

import app.folyo.settings.StorageSettings;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;

/** S3 uyumlu nesne deposu. Dosyalar disariya acilmaz; API uzerinden yetki kontroluyle sunulur. */
final class S3BlobStore implements BlobStore, AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(S3BlobStore.class);

    private final S3Client client;
    private final String bucket;

    S3BlobStore(StorageSettings.S3 settings, String secretKey) {
        var builder = S3Client.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .region(Region.of(settings.region() == null || settings.region().isBlank() ? "auto" : settings.region()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(settings.accessKey(), secretKey)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(settings.pathStyle()).build());
        if (settings.endpoint() != null && !settings.endpoint().isBlank()) {
            builder.endpointOverride(URI.create(settings.endpoint()));
        }
        this.client = builder.build();
        this.bucket = settings.bucket();
    }

    @Override
    public void put(String key, Path file, String contentType) {
        check(key);
        client.putObject(r -> r.bucket(bucket).key(key).contentType(contentType), RequestBody.fromFile(file));
    }

    @Override
    public void put(String key, byte[] bytes, String contentType) {
        check(key);
        client.putObject(r -> r.bucket(bucket).key(key).contentType(contentType), RequestBody.fromBytes(bytes));
    }

    @Override
    public InputStream open(String key, long offset, long length) {
        check(key);
        String range = length < 0 ? "bytes=" + offset + "-" : "bytes=" + offset + "-" + (offset + length - 1);
        return client.getObject(r -> r.bucket(bucket).key(key).range(range));
    }

    @Override
    public long size(String key) {
        check(key);
        return client.headObject(r -> r.bucket(bucket).key(key)).contentLength();
    }

    @Override
    public void deleteQuietly(Collection<String> keys) {
        if (keys.isEmpty()) {
            return;
        }
        try {
            List<ObjectIdentifier> ids = keys.stream().map(k -> ObjectIdentifier.builder().key(k).build()).toList();
            client.deleteObjects(r -> r.bucket(bucket).delete(Delete.builder().objects(ids).quiet(true).build()));
        } catch (RuntimeException e) {
            log.warn("Depodan silinemedi: {} dosya", keys.size(), e);
        }
    }

    @Override
    public void close() {
        client.close();
    }

    private static void check(String key) {
        if (!LocalBlobStore.KEY.matcher(key).matches()) {
            throw new IllegalArgumentException("Gecersiz depolama anahtari");
        }
    }
}
