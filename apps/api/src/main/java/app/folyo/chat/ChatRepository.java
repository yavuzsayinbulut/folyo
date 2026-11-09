package app.folyo.chat;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class ChatRepository {

    record Member(UUID userId, MemberState state, long deliveredSeq, long readSeq) {
    }

    record Conversation(UUID id, UUID userLow, UUID userHigh, UUID startedBy, long lastSeq) {

        UUID other(UUID me) {
            return me.equals(userLow) ? userHigh : userLow;
        }

        boolean has(UUID user) {
            return user.equals(userLow) || user.equals(userHigh);
        }
    }

    record MessageRow(long id, UUID conversationId, long seq, UUID senderId, MessageKind kind, String body,
            UUID assetId, String sticker, Instant createdAt, boolean deleted) {
    }

    /** Sohbet listesindeki satir: karsi taraf, son mesaj, okunmamis sayisi ve tik bilgisi tek sorguda. */
    record ListRow(UUID id, UUID otherId, String otherName, String otherAvatarUrl, String otherUsername,
            MemberState myState, long myReadSeq, long otherDeliveredSeq, long otherReadSeq, UUID startedBy,
            Instant lastMessageAt, long unread, MessageRow last, String otherLastSeenAudience, boolean otherReadReceipts,
            Instant otherLastSeenAt) {
    }

    private final JdbcClient jdbc;

    ChatRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Conversation> find(UUID id) {
        return jdbc.sql("select id, user_low, user_high, started_by, last_seq from conversations where id = :id")
                .param("id", id).query(this::conversation).optional();
    }

    Optional<Conversation> between(UUID a, UUID b) {
        return jdbc.sql("select id, user_low, user_high, started_by, last_seq from conversations where user_low = :low and user_high = :high")
                .param("low", min(a, b)).param("high", max(a, b)).query(this::conversation).optional();
    }

    /** Ayni iki kisi icin es zamanli acilista tek sohbet olusur (benzersiz cift). */
    Conversation create(UUID starter, UUID other, MemberState otherState) {
        UUID id = UUID.randomUUID();
        int inserted = jdbc.sql("""
                insert into conversations (id, user_low, user_high, started_by) values (:id, :low, :high, :starter)
                on conflict (user_low, user_high) do nothing""")
                .param("id", id).param("low", min(starter, other)).param("high", max(starter, other))
                .param("starter", starter).update();
        if (inserted == 1) {
            jdbc.sql("insert into conversation_members (conversation_id, user_id, state) values (:c, :u, 'ACTIVE'), (:c, :o, :s)")
                    .param("c", id).param("u", starter).param("o", other).param("s", otherState.name()).update();
        }
        return between(starter, other).orElseThrow();
    }

    /** Siradaki mesaj numarasi; sohbet satiri kilitlenir, numaralar bosluksuz ve sirali kalir. */
    long nextSeq(UUID conversationId) {
        return jdbc.sql("update conversations set last_seq = last_seq + 1, last_message_at = now() where id = :id returning last_seq")
                .param("id", conversationId).query(Long.class).single();
    }

    Optional<MessageRow> byClientId(UUID senderId, String clientId) {
        return jdbc.sql(MESSAGE + " where sender_user_id = :sender and client_id = :client")
                .param("sender", senderId).param("client", clientId).query(this::message).optional();
    }

    MessageRow insert(UUID conversationId, long seq, UUID senderId, MessageKind kind, String body, UUID assetId,
            String sticker, String clientId) {
        long id = jdbc.sql("""
                insert into chat_messages (conversation_id, seq, sender_user_id, kind, body, asset_id, sticker, client_id)
                values (:c, :seq, :sender, :kind, :body, :asset, :sticker, :client) returning id""")
                .param("c", conversationId).param("seq", seq).param("sender", senderId).param("kind", kind.name())
                .param("body", body).param("asset", assetId).param("sticker", sticker).param("client", clientId)
                .query(Long.class).single();
        return jdbc.sql(MESSAGE + " where id = :id").param("id", id).query(this::message).single();
    }

    private static final String MESSAGE = """
            select id, conversation_id, seq, sender_user_id, kind, body, asset_id, sticker, created_at, deleted_at
            from chat_messages""";

    List<MessageRow> messages(UUID conversationId, Long beforeSeq, int limit) {
        return jdbc.sql(MESSAGE + " where conversation_id = :c and (cast(:before as bigint) is null or seq < :before) order by seq desc limit :limit")
                .param("c", conversationId).param("before", beforeSeq, java.sql.Types.BIGINT).param("limit", limit)
                .query(this::message).list();
    }

    Optional<MessageRow> message(UUID conversationId, long messageId) {
        return jdbc.sql(MESSAGE + " where conversation_id = :c and id = :id").param("c", conversationId).param("id", messageId)
                .query(this::message).optional();
    }

    long countBySenderSince(UUID conversationId, UUID senderId, long afterSeq) {
        return jdbc.sql("select count(*) from chat_messages where conversation_id = :c and sender_user_id = :s and seq > :after")
                .param("c", conversationId).param("s", senderId).param("after", afterSeq).query(Long.class).single();
    }

    void softDelete(long messageId) {
        jdbc.sql("update chat_messages set deleted_at = now(), body = null, sticker = null, asset_id = null where id = :id")
                .param("id", messageId).update();
    }

    List<Member> members(UUID conversationId) {
        return jdbc.sql("select user_id, state, delivered_seq, read_seq from conversation_members where conversation_id = :c")
                .param("c", conversationId)
                .query((rs, i) -> new Member(rs.getObject("user_id", UUID.class), MemberState.valueOf(rs.getString("state")),
                        rs.getLong("delivered_seq"), rs.getLong("read_seq")))
                .list();
    }

    void setState(UUID conversationId, UUID userId, MemberState state) {
        jdbc.sql("update conversation_members set state = :s where conversation_id = :c and user_id = :u")
                .param("s", state.name()).param("c", conversationId).param("u", userId).update();
    }

    /** Ileriye dogru tasir (geri almaz); sohbetteki son mesajdan ileri gidemez. */
    boolean markDelivered(UUID conversationId, UUID userId, long seq) {
        return jdbc.sql("""
                update conversation_members m set delivered_seq = least(:seq, c.last_seq)
                from conversations c where c.id = m.conversation_id and m.conversation_id = :c and m.user_id = :u
                and m.delivered_seq < least(:seq, c.last_seq)""")
                .param("seq", seq).param("c", conversationId).param("u", userId).update() > 0;
    }

    boolean markRead(UUID conversationId, UUID userId, long seq) {
        return jdbc.sql("""
                update conversation_members m set read_seq = least(:seq, c.last_seq),
                    delivered_seq = greatest(m.delivered_seq, least(:seq, c.last_seq))
                from conversations c where c.id = m.conversation_id and m.conversation_id = :c and m.user_id = :u
                and m.read_seq < least(:seq, c.last_seq)""")
                .param("seq", seq).param("c", conversationId).param("u", userId).update() > 0;
    }

    List<ListRow> list(UUID userId, Collection<String> states) {
        return jdbc.sql("""
                select c.id, c.started_by, c.last_message_at, me.state as my_state, me.read_seq as my_read,
                       other.delivered_seq as other_delivered, other.read_seq as other_read,
                       u.id as other_id, u.name as other_name, u.avatar_url as other_avatar, p.username as other_username,
                       u.last_seen_audience, u.read_receipts, u.last_seen_at,
                       (select count(*) from chat_messages cm where cm.conversation_id = c.id and cm.seq > me.read_seq
                          and cm.sender_user_id <> :user and cm.deleted_at is null) as unread,
                       lm.id as lm_id, lm.seq as lm_seq, lm.sender_user_id as lm_sender, lm.kind as lm_kind, lm.body as lm_body,
                       lm.asset_id as lm_asset, lm.sticker as lm_sticker, lm.created_at as lm_created, lm.deleted_at as lm_deleted
                from conversation_members me
                join conversations c on c.id = me.conversation_id
                join conversation_members other on other.conversation_id = c.id and other.user_id <> me.user_id
                join users u on u.id = other.user_id
                left join profiles p on p.user_id = u.id
                left join lateral (select * from chat_messages cm where cm.conversation_id = c.id order by cm.seq desc limit 1) lm on true
                where me.user_id = :user and me.state in (:states) and c.last_seq > 0
                order by c.last_message_at desc nulls last""")
                .param("user", userId).param("states", states)
                .query((rs, i) -> new ListRow(rs.getObject("id", UUID.class), rs.getObject("other_id", UUID.class),
                        rs.getString("other_name"), rs.getString("other_avatar"), rs.getString("other_username"),
                        MemberState.valueOf(rs.getString("my_state")), rs.getLong("my_read"), rs.getLong("other_delivered"),
                        rs.getLong("other_read"), rs.getObject("started_by", UUID.class), instant(rs, "last_message_at"),
                        rs.getLong("unread"), lastMessage(rs), rs.getString("last_seen_audience"), rs.getBoolean("read_receipts"),
                        instant(rs, "last_seen_at")))
                .list();
    }

    /** Okunmamis mesaj sayilari (sekme rozeti): sohbetler ve istekler ayri. */
    long[] unread(UUID userId) {
        return jdbc.sql("""
                select coalesce(sum(case when me.state <> 'REQUEST' then n end), 0) as chats,
                       coalesce(sum(case when me.state = 'REQUEST' then n end), 0) as requests
                from conversation_members me
                cross join lateral (select count(*) as n from chat_messages cm where cm.conversation_id = me.conversation_id
                    and cm.seq > me.read_seq and cm.sender_user_id <> me.user_id and cm.deleted_at is null) x
                where me.user_id = :user and me.state <> 'ARCHIVED'""")
                .param("user", userId).query((rs, i) -> new long[] {rs.getLong("chats"), rs.getLong("requests")}).single();
    }

    /** Kullanicinin aktif sohbet ettigi kisiler ("sohbet ettiklerim" kitlesi ve durum yayini). */
    List<UUID> partners(UUID userId) {
        return jdbc.sql("""
                select other.user_id from conversation_members me
                join conversation_members other on other.conversation_id = me.conversation_id and other.user_id <> me.user_id
                where me.user_id = :user and me.state <> 'REQUEST' and other.state <> 'REQUEST'""")
                .param("user", userId).query(UUID.class).list();
    }

    boolean partners(UUID a, UUID b) {
        return jdbc.sql("""
                select exists(select 1 from conversations c
                  join conversation_members ma on ma.conversation_id = c.id and ma.user_id = :a and ma.state <> 'REQUEST'
                  join conversation_members mb on mb.conversation_id = c.id and mb.user_id = :b and mb.state <> 'REQUEST'
                  where c.user_low = :low and c.user_high = :high)""")
                .param("a", a).param("b", b).param("low", min(a, b)).param("high", max(a, b)).query(Boolean.class).single();
    }

    void touchLastSeen(UUID userId) {
        jdbc.sql("update users set last_seen_at = now() where id = :id").param("id", userId).update();
    }

    record PresenceSettings(String lastSeenAudience, boolean readReceipts, Instant lastSeenAt) {
    }

    PresenceSettings presenceSettings(UUID userId) {
        return jdbc.sql("select last_seen_audience, read_receipts, last_seen_at from users where id = :id").param("id", userId)
                .query((rs, i) -> new PresenceSettings(rs.getString("last_seen_audience"), rs.getBoolean("read_receipts"),
                        instant(rs, "last_seen_at"))).single();
    }

    void savePresenceSettings(UUID userId, String lastSeenAudience, boolean readReceipts) {
        jdbc.sql("update users set last_seen_audience = :a, read_receipts = :r where id = :id")
                .param("a", lastSeenAudience).param("r", readReceipts).param("id", userId).update();
    }

    private MessageRow lastMessage(ResultSet rs) throws SQLException {
        if (rs.getObject("lm_id") == null) {
            return null;
        }
        return new MessageRow(rs.getLong("lm_id"), rs.getObject("id", UUID.class), rs.getLong("lm_seq"),
                rs.getObject("lm_sender", UUID.class), MessageKind.valueOf(rs.getString("lm_kind")), rs.getString("lm_body"),
                rs.getObject("lm_asset", UUID.class), rs.getString("lm_sticker"), instant(rs, "lm_created"),
                rs.getTimestamp("lm_deleted") != null);
    }

    private Conversation conversation(ResultSet rs, int i) throws SQLException {
        return new Conversation(rs.getObject("id", UUID.class), rs.getObject("user_low", UUID.class),
                rs.getObject("user_high", UUID.class), rs.getObject("started_by", UUID.class), rs.getLong("last_seq"));
    }

    private MessageRow message(ResultSet rs, int i) throws SQLException {
        return new MessageRow(rs.getLong("id"), rs.getObject("conversation_id", UUID.class), rs.getLong("seq"),
                rs.getObject("sender_user_id", UUID.class), MessageKind.valueOf(rs.getString("kind")), rs.getString("body"),
                rs.getObject("asset_id", UUID.class), rs.getString("sticker"), instant(rs, "created_at"),
                rs.getTimestamp("deleted_at") != null);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static UUID min(UUID a, UUID b) {
        return a.toString().compareTo(b.toString()) < 0 ? a : b;
    }

    private static UUID max(UUID a, UUID b) {
        return a.toString().compareTo(b.toString()) < 0 ? b : a;
    }
}
