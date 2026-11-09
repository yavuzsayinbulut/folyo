package app.folyo.asset;

import app.folyo.settings.StorageSettings;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class AssetRepository {

    private static final String COLUMNS = """
            id, owner_user_id, kind, store, content_type, byte_size, width, height, duration_ms, storage_key,
            variants::text as variants, attached_at, created_at\s""";

    private final JdbcClient jdbc;
    private final JsonMapper json = JsonMapper.builder().build();

    AssetRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    void insert(Asset a, String sha256) {
        jdbc.sql("""
                insert into media_assets (id, owner_user_id, kind, store, content_type, byte_size, width, height,
                    duration_ms, storage_key, variants, sha256, attached_at)
                values (:id, :owner, :kind, :store, :type, :size, :w, :h, :d, :key, cast(:variants as jsonb), :sha, :attached)""")
                .param("id", a.id()).param("owner", a.ownerId()).param("kind", a.kind().name())
                .param("store", a.store().name()).param("type", a.contentType()).param("size", a.byteSize())
                .param("w", a.width()).param("h", a.height()).param("d", a.durationMs()).param("key", a.storageKey())
                .param("variants", json.writeValueAsString(a.variants())).param("sha", sha256)
                .param("attached", a.attachedAt() == null ? null : Timestamp.from(a.attachedAt()))
                .update();
    }

    public Optional<Asset> find(UUID id) {
        return jdbc.sql("select " + COLUMNS + " from media_assets where id = :id").param("id", id)
                .query(this::map).optional();
    }

    public List<Asset> findAll(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + COLUMNS + " from media_assets where id in (:ids)").param("ids", ids)
                .query(this::map).list();
    }

    /** Sahibinin henuz baglanmamis yuklemelerini kilitleyerek baglar; baskasinin ya da baglanmis yukleme sayilmaz. */
    public List<Asset> lockOwnUnattached(UUID ownerId, Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select " + COLUMNS + """
                 from media_assets where id in (:ids) and owner_user_id = :owner and attached_at is null
                 and kind in ('PHOTO', 'VIDEO') for update""")
                .param("ids", ids).param("owner", ownerId).query(this::map).list();
    }

    public void markAttached(Collection<UUID> ids) {
        if (!ids.isEmpty()) {
            jdbc.sql("update media_assets set attached_at = now() where id in (:ids)").param("ids", ids).update();
        }
    }

    List<Asset> stickersOf(UUID ownerId) {
        return jdbc.sql("select " + COLUMNS + " from media_assets where owner_user_id = :owner and kind = 'STICKER' order by created_at")
                .param("owner", ownerId).query(this::map).list();
    }

    long countStickers(UUID ownerId) {
        return jdbc.sql("select count(*) from media_assets where owner_user_id = :owner and kind = 'STICKER'")
                .param("owner", ownerId).query(Long.class).single();
    }

    public void delete(Collection<UUID> ids) {
        if (!ids.isEmpty()) {
            jdbc.sql("delete from media_assets where id in (:ids)").param("ids", ids).update();
        }
    }

    /** Bir gun icinde gonderiye/sohbete baglanmamis yuklemeler. */
    List<Asset> abandoned(Instant before) {
        return jdbc.sql("select " + COLUMNS + " from media_assets where attached_at is null and kind in ('PHOTO', 'VIDEO') and created_at < :before limit 500")
                .param("before", Timestamp.from(before)).query(this::map).list();
    }

    /** Bagli ama gonderisi/mesaji silinmis (sohbet karsi tarafin hesabiyla birlikte gitmis olabilir) medyalar. */
    List<Asset> orphaned(Instant before) {
        return jdbc.sql("select " + COLUMNS + """
                 from media_assets a where a.kind in ('PHOTO', 'VIDEO') and a.attached_at is not null and a.attached_at < :before
                 and not exists (select 1 from post_media pm where pm.asset_id = a.id)
                 and not exists (select 1 from chat_messages cm where cm.asset_id = a.id) limit 500""")
                .param("before", Timestamp.from(before)).query(this::map).list();
    }

    /** Hesap silinmeden once kullanicinin tum dosyalari (depodan ayrica silinecek). */
    public List<Asset> ownedBy(UUID ownerId) {
        return jdbc.sql("select " + COLUMNS + " from media_assets where owner_user_id = :owner").param("owner", ownerId)
                .query(this::map).list();
    }

    /** Medyanin nereye bagli oldugu: okuma yetkisi buna gore belirlenir. */
    record Attachment(UUID postId, UUID conversationId) {
    }

    Attachment attachmentOf(UUID assetId) {
        UUID post = jdbc.sql("select post_id from post_media where asset_id = :id").param("id", assetId)
                .query(UUID.class).optional().orElse(null);
        UUID conversation = post != null ? null : jdbc.sql("select conversation_id from chat_messages where asset_id = :id limit 1")
                .param("id", assetId).query(UUID.class).optional().orElse(null);
        return new Attachment(post, conversation);
    }

    private Asset map(ResultSet rs, int i) throws SQLException {
        Map<String, Asset.VariantRef> variants = json.readValue(rs.getString("variants"),
                new TypeReference<LinkedHashMap<String, Asset.VariantRef>>() { });
        Timestamp attached = rs.getTimestamp("attached_at");
        return new Asset(rs.getObject("id", UUID.class), rs.getObject("owner_user_id", UUID.class),
                AssetKind.valueOf(rs.getString("kind")), StorageSettings.Provider.valueOf(rs.getString("store")),
                rs.getString("content_type"), rs.getLong("byte_size"), (Integer) rs.getObject("width"),
                (Integer) rs.getObject("height"), (Integer) rs.getObject("duration_ms"), rs.getString("storage_key"),
                variants, attached == null ? null : attached.toInstant(), rs.getTimestamp("created_at").toInstant());
    }

    static List<String> allKeys(Asset a) {
        List<String> keys = new ArrayList<>();
        keys.add(a.storageKey());
        a.variants().values().forEach(v -> {
            if (!keys.contains(v.key())) {
                keys.add(v.key());
            }
        });
        return keys;
    }
}
