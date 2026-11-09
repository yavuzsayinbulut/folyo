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
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.utility.DockerImageName;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/** S3 uyumlu depo (MinIO): yazma, aralikli okuma, boyut, silme. */
class S3BlobStoreTest {

    static MinIOContainer minio = new MinIOContainer(DockerImageName.parse("quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z").asCompatibleSubstituteFor("minio/minio"));
    static S3BlobStore store;

    @TempDir
    Path dir;

    @BeforeAll
    static void start() {
        minio.start();
        try (S3Client admin = S3Client.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .region(Region.US_EAST_1)
                .endpointOverride(java.net.URI.create(minio.getS3URL()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(minio.getUserName(), minio.getPassword())))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build()) {
            admin.createBucket(r -> r.bucket("folyo"));
        }
        store = new S3BlobStore(new StorageSettings.S3(minio.getS3URL(), "us-east-1", "folyo", minio.getUserName(), null, true),
                minio.getPassword());
    }

    @AfterAll
    static void stop() {
        store.close();
        minio.stop();
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
