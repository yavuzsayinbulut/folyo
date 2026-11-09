package app.folyo.verification;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class VerificationCodeRepository {

    record OpenCode(UUID id, String target, String codeHash, int attempts, Instant expiresAt) {
    }

    private final JdbcClient jdbc;

    VerificationCodeRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    void insert(UUID id, UUID userId, Channel channel, String target, String codeHash, Instant expiresAt) {
        jdbc.sql("""
                insert into verification_codes (id, user_id, channel, target, code_hash, expires_at)
                values (:id, :user, :channel, :target, :hash, :expires)""")
                .param("id", id).param("user", userId).param("channel", channel.name()).param("target", target)
                .param("hash", codeHash).param("expires", java.sql.Timestamp.from(expiresAt)).update();
    }

    /** Ayni kullanicinin ayni kanalda verilen andan sonra istedigi kod sayisi ve en yenisinin zamani. */
    long countSince(UUID userId, Channel channel, Instant since) {
        return jdbc.sql("select count(*) from verification_codes where user_id = :user and channel = :channel and created_at > :since")
                .param("user", userId).param("channel", channel.name()).param("since", java.sql.Timestamp.from(since))
                .query(Long.class).single();
    }

    /**
     * Ayni numaraya/adrese (hesaptan bagimsiz) gonderilen kod sayisi: baskasinin telefonunu/e-postasini kodla bogmayi
     * engeller. E-posta buyuk/kucuk harf ve +etiket farklariyla cogaltilamaz.
     */
    long countTargetSince(String target, Instant since) {
        return jdbc.sql("""
                select count(*) from verification_codes
                where lower(regexp_replace(target, '\\+[^@]*@', '@')) = lower(regexp_replace(:target, '\\+[^@]*@', '@'))
                and created_at > :since""")
                .param("target", target).param("since", java.sql.Timestamp.from(since)).query(Long.class).single();
    }

    /** Platform genelinde verilen andan sonra gonderilen kod sayisi (gunluk SMS butcesi). */
    long countChannelSince(Channel channel, Instant since) {
        return jdbc.sql("select count(*) from verification_codes where channel = :channel and created_at > :since")
                .param("channel", channel.name()).param("since", java.sql.Timestamp.from(since)).query(Long.class).single();
    }

    /** Eski kayitlar (baskalari icin girilmis numara/e-posta dahil) suresiz tutulmaz. */
    int deleteOlderThan(Instant before) {
        return jdbc.sql("delete from verification_codes where created_at < :before")
                .param("before", java.sql.Timestamp.from(before)).update();
    }

    /** En yeni kullanilmamis kod; dogrulama sirasinda satir kilitlenir (es zamanli denemeler sirayla sayilir). */
    Optional<OpenCode> lockLatestOpen(UUID userId, Channel channel) {
        return jdbc.sql("""
                select id, target, code_hash, attempts, expires_at from verification_codes
                where user_id = :user and channel = :channel and consumed_at is null
                order by created_at desc limit 1 for update""")
                .param("user", userId).param("channel", channel.name())
                .query((rs, i) -> new OpenCode(rs.getObject("id", UUID.class), rs.getString("target"),
                        rs.getString("code_hash"), rs.getInt("attempts"), rs.getTimestamp("expires_at").toInstant()))
                .optional();
    }

    void incrementAttempts(UUID id) {
        jdbc.sql("update verification_codes set attempts = attempts + 1 where id = :id").param("id", id).update();
    }

    void consume(UUID id) {
        jdbc.sql("update verification_codes set consumed_at = now() where id = :id").param("id", id).update();
    }

    /** Yeni kod istenince eskileri gecersiz olur. */
    void consumeOpen(UUID userId, Channel channel) {
        jdbc.sql("update verification_codes set consumed_at = now() where user_id = :user and channel = :channel and consumed_at is null")
                .param("user", userId).param("channel", channel.name()).update();
    }

    void delete(UUID id) {
        jdbc.sql("delete from verification_codes where id = :id").param("id", id).update();
    }
}
