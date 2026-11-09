package app.folyo.settings;

/** Yeni yuklemelerin nereye yazilacagi. Eski dosyalar yazildiklari depodan okunmaya devam eder. */
public record StorageSettings(Provider provider, S3 s3) {

    public enum Provider {
        LOCAL,
        S3
    }

    /** endpoint bos ise AWS S3; doluysa S3 uyumlu servis (Cloudflare R2, MinIO...). Gizli anahtar sifreli saklanir. */
    public record S3(String endpoint, String region, String bucket, String accessKey, String secretKeyEnc,
            boolean pathStyle) {
    }

    public static final StorageSettings LOCAL = new StorageSettings(Provider.LOCAL, null);
}
