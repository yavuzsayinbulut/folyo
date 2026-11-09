package app.folyo.asset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.folyo.settings.StorageSettings;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/**
 * S3 uyumlu depo: yazma, aralikli okuma, boyut, silme. Sunucu olarak acik kaynak S3 taklidi (adobe/s3mock) kullanilir;
 * MinIO hazir imaj dagitimini durdurdu.
 */
class S3BlobStoreTest {

    @SuppressWarnings("resource")
    static GenericContainer<?> s3 = new GenericContainer<>("adobe/s3mock:3.12.0")
            .withExposedPorts(9090)
            .waitingFor(Wait.forHttp("/").forPort(9090));
    static S3BlobStore store;

    @TempDir
    Path dir;

    @BeforeAll
    static void start() {
        s3.start();
        String endpoint = "http://" + s3.getHost() + ":" + s3.getMappedPort(9090);
        try (S3Client admin = S3Client.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .region(Region.US_EAST_1)
                .endpointOverride(java.net.URI.create(endpoint))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build()) {
            admin.createBucket(r -> r.bucket("folyo"));
        }
        store = new S3BlobStore(new StorageSettings.S3(endpoint, "us-east-1", "folyo", "test", null, true), "test");
    }

    @AfterAll
    static void stop() {
        store.close();
        s3.stop();
    }

    @Test
    void writesReadsRangesAndDeletes() throws Exception {
        String key = UUID.randomUUID() + "/original.mp4";
        Path file = dir.resolve("v.mp4");
        Files.writeString(file, "0123456789abcdef");
        store.put(key, file, "video/mp4");

        assertThat(store.size(key)).isEqualTo(16);
        try (var in = store.open(key, 0, -1)) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.US_ASCII)).isEqualTo("0123456789abcdef");
        }
        try (var in = store.open(key, 10, 4)) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.US_ASCII)).isEqualTo("abcd");
        }

        String small = UUID.randomUUID() + "/thumb.jpg";
        store.put(small, "kucuk".getBytes(StandardCharsets.UTF_8), "image/jpeg");
        store.deleteQuietly(List.of(key, small));
        assertThatThrownBy(() -> store.size(key)).isInstanceOf(RuntimeException.class);
    }

    @Test
    void rejectsKeysOutsideTheLayout() {
        assertThatThrownBy(() -> store.put("../disari.jpg", new byte[] {1}, "image/jpeg"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
