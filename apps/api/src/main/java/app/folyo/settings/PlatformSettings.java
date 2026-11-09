package app.folyo.settings;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Admin panelinden yonetilen ayarlar (platform_settings). Okumalar sik (her profil gorunumunde politika) oldugu icin
 * kisa sure onbelleklenir; kayit onbellegi hemen temizler.
 */
@Service
public class PlatformSettings {

    static final String SMS = "sms";
    static final String EMAIL = "email";
    static final String POLICY = "policy";
    static final String STORAGE = "storage";

    private final JdbcClient jdbc;
    private final JsonMapper json = JsonMapper.builder().build();
    private final boolean allowLog;
    private final Cache<String, Object> cache = Caffeine.newBuilder().expireAfterWrite(Duration.ofSeconds(30)).build();

    public PlatformSettings(JdbcClient jdbc, @Value("${folyo.integrations.allow-log:false}") boolean allowLog) {
        this.jdbc = jdbc;
        this.allowLog = allowLog;
    }

    /** Gelistirme/test ortaminda kodu loga yazan saglayicilar secilebilir; prod'da kapali. */
    public boolean allowLog() {
        return allowLog;
    }

    public SmsSettings sms() {
        return (SmsSettings) cache.get(SMS, k -> read(k, SmsSettings.class)
                .orElse(SmsSettings.off(allowLog ? SmsProvider.LOG : SmsProvider.OFF)));
    }

    public EmailSettings email() {
        return (EmailSettings) cache.get(EMAIL, k -> read(k, EmailSettings.class)
                .orElse(EmailSettings.off(allowLog ? EmailProvider.LOG : EmailProvider.OFF)));
    }

    public VerificationPolicy policy() {
        return (VerificationPolicy) cache.get(POLICY, k -> read(k, VerificationPolicy.class)
                .orElse(VerificationPolicy.DEFAULT));
    }

    public StorageSettings storage() {
        return (StorageSettings) cache.get(STORAGE, k -> read(k, StorageSettings.class).orElse(StorageSettings.LOCAL));
    }

    public void saveStorage(StorageSettings value, UUID adminId) {
        write(STORAGE, value, adminId);
    }

    public void saveSms(SmsSettings value, UUID adminId) {
        write(SMS, value, adminId);
    }

    public void saveEmail(EmailSettings value, UUID adminId) {
        write(EMAIL, value, adminId);
    }

    public void savePolicy(VerificationPolicy value, UUID adminId) {
        write(POLICY, value, adminId);
    }

    private <T> Optional<T> read(String key, Class<T> type) {
        return jdbc.sql("select value::text from platform_settings where key = :key").param("key", key)
                .query(String.class).optional().map(text -> json.readValue(text, type));
    }

    private void write(String key, Object value, UUID adminId) {
        jdbc.sql("""
                insert into platform_settings (key, value, updated_at, updated_by)
                values (:key, cast(:value as jsonb), now(), :admin)
                on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by""")
                .param("key", key).param("value", json.writeValueAsString(value)).param("admin", adminId).update();
        cache.invalidate(key);
    }
}
