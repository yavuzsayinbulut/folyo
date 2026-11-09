package app.folyo.post;

import app.folyo.access.Audience;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * pr: gonderinin yer aldigi sayfa (kitle kontrolu); ap: yazarin kendi sayfasi (yanit yazanin sayfasi olmayabilir).
 * Akislar tek sorguyla okunur: yazar bilgisi, bakan kisinin begenisi ve dogrulanmis rozeti birlikte gelir.
 * Sayfalama (created_at, id) imleciyle yapilir; OFFSET kullanilmaz, derin sayfalar da indeksten okunur.
 */
@Repository
class PostRepository {

    record Row(UUID id, UUID authorId, UUID profileId, UUID replyToId, String body, Audience audience, String status,
            int likeCount, int replyCount, Instant createdAt, String username, String displayName, String avatarUrl,
            boolean authorVerified, boolean likedByViewer, Audience profileAudience) {
    }

    /** Bakan kisinin gorebilecegi kitleler ve "dogrulanmis" tanimi (admin politikasi). */
    record Scope(UUID viewerId, List<String> audiences, boolean requireEmail, boolean requirePhone) {
    }

    private static final String SELECT = """
            select p.id, p.author_user_id, p.profile_id, p.reply_to_id, p.body, p.audience, p.status, p.like_count,
                   p.reply_count, p.created_at, ap.username, coalesce(ap.display_name, u.name) as display_name,
                   u.avatar_url, pr.profile_audience,
                   ((not :requireEmail or u.email_verified_at is not null)
                     and (not :requirePhone or u.phone_verified_at is not null)) as author_verified,
                   exists(select 1 from post_likes l where l.post_id = p.id and l.user_id = :viewer) as liked
            from posts p
            join profiles pr on pr.id = p.profile_id
            join users u on u.id = p.author_user_id
            left join profiles ap on ap.user_id = p.author_user_id
            """;

    /** Bakan kisi yazarsa her sey; degilse gonderinin ve sayfanin kitlesi ona acik olmali. */
    private static final String VISIBLE = """
            (p.author_user_id = :viewer or pr.user_id = :viewer
             or (p.audience in (:audiences) and pr.profile_audience in (:audiences) and p.status = 'VISIBLE'))
            """;

    private final JdbcClient jdbc;

    PostRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    void insert(UUID id, UUID authorId, UUID profileId, UUID replyToId, String body, Audience audience, String status) {
        jdbc.sql("""
                insert into posts (id, author_user_id, profile_id, reply_to_id, body, audience, status)
                values (:id, :author, :profile, :replyTo, :body, :audience, :status)""")
                .param("id", id).param("author", authorId).param("profile", profileId).param("replyTo", replyToId)
                .param("body", body).param("audience", audience.name()).param("status", status).update();
    }

    void insertMedia(UUID postId, List<UUID> assetIds) {
        for (int i = 0; i < assetIds.size(); i++) {
            jdbc.sql("insert into post_media (post_id, position, asset_id) values (:post, :pos, :asset)")
                    .param("post", postId).param("pos", i).param("asset", assetIds.get(i)).update();
        }
    }

    Optional<Row> find(UUID id, Scope scope) {
        return bind(jdbc.sql(SELECT + " where p.id = :id"), scope).param("id", id).query(this::map).optional();
    }

    /** Satiri kilitler (yanit sayaci, silme). */
    Optional<UUID> lock(UUID id) {
        return jdbc.sql("select id from posts where id = :id for update").param("id", id).query(UUID.class).optional();
    }

    List<Row> profileTimeline(UUID profileId, Scope scope, Instant beforeTime, UUID beforeId, int limit) {
        return bind(jdbc.sql(SELECT + " where p.profile_id = :profile and p.reply_to_id is null and " + VISIBLE
                + cursor(beforeTime) + " order by p.created_at desc, p.id desc limit :limit"), scope)
                .param("profile", profileId).param("limit", limit)
                .params(cursorParams(beforeTime, beforeId)).query(this::map).list();
    }

    /** Kesfet: herkesin gorebildigi, dogrulanmis hesaplarin ust duzey gonderileri. */
    List<Row> explore(Scope scope, Instant beforeTime, UUID beforeId, int limit) {
        return bind(jdbc.sql(SELECT + """
                 where p.reply_to_id is null and p.status = 'VISIBLE'
                 and p.audience in (:audiences) and pr.profile_audience in (:audiences)
                 and (not :requireEmail or u.email_verified_at is not null)
                 and (not :requirePhone or u.phone_verified_at is not null)""" + cursor(beforeTime)
                + " order by p.created_at desc, p.id desc limit :limit"), scope)
                .param("limit", limit).params(cursorParams(beforeTime, beforeId)).query(this::map).list();
    }

    /** Yanitlar eskiden yeniye. Onay bekleyenleri yalniz yazari ve gonderi sahibi gorur. */
    List<Row> replies(UUID postId, UUID postAuthorId, Scope scope, int limit) {
        return bind(jdbc.sql(SELECT + """
                 where p.reply_to_id = :post
                 and (p.status = 'VISIBLE' or p.author_user_id = :viewer or :postAuthor = :viewer)
                 order by p.created_at, p.id limit :limit"""), scope)
                .param("post", postId).param("postAuthor", postAuthorId).param("limit", limit).query(this::map).list();
    }

    Map<UUID, List<UUID>> mediaIds(Collection<UUID> postIds) {
        Map<UUID, List<UUID>> result = new HashMap<>();
        if (postIds.isEmpty()) {
            return result;
        }
        jdbc.sql("select post_id, asset_id from post_media where post_id in (:ids) order by post_id, position")
                .param("ids", postIds)
                .query((rs, i) -> Map.entry(rs.getObject("post_id", UUID.class), rs.getObject("asset_id", UUID.class)))
                .list().forEach(e -> result.computeIfAbsent(e.getKey(), k -> new java.util.ArrayList<>()).add(e.getValue()));
        return result;
    }

    /** Begeni bir kez sayilir; sayac ayni transaction'da guncellenir. */
    boolean like(UUID postId, UUID userId) {
        int inserted = jdbc.sql("insert into post_likes (post_id, user_id) values (:post, :user) on conflict do nothing")
                .param("post", postId).param("user", userId).update();
        if (inserted == 1) {
            jdbc.sql("update posts set like_count = like_count + 1 where id = :post").param("post", postId).update();
        }
        return inserted == 1;
    }

    boolean unlike(UUID postId, UUID userId) {
        int deleted = jdbc.sql("delete from post_likes where post_id = :post and user_id = :user")
                .param("post", postId).param("user", userId).update();
        if (deleted == 1) {
            jdbc.sql("update posts set like_count = greatest(like_count - 1, 0) where id = :post").param("post", postId).update();
        }
        return deleted == 1;
    }

    void changeReplyCount(UUID postId, int delta) {
        jdbc.sql("update posts set reply_count = greatest(reply_count + :delta, 0) where id = :post")
                .param("delta", delta).param("post", postId).update();
    }

    void approve(UUID id) {
        jdbc.sql("update posts set status = 'VISIBLE' where id = :id").param("id", id).update();
    }

    void delete(UUID id) {
        jdbc.sql("delete from posts where id = :id").param("id", id).update();
    }

    long countByAuthorSince(UUID authorId, boolean replies, Instant since) {
        return jdbc.sql("select count(*) from posts where author_user_id = :author and created_at > :since and (reply_to_id is not null) = :replies")
                .param("author", authorId).param("since", Timestamp.from(since)).param("replies", replies)
                .query(Long.class).single();
    }

    private static String cursor(Instant beforeTime) {
        return beforeTime == null ? "" : " and (p.created_at, p.id) < (:beforeTime, :beforeId)";
    }

    private static Map<String, Object> cursorParams(Instant beforeTime, UUID beforeId) {
        return beforeTime == null ? Map.of() : Map.of("beforeTime", Timestamp.from(beforeTime), "beforeId", beforeId);
    }

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec spec, Scope scope) {
        return spec.param("viewer", scope.viewerId(), java.sql.Types.OTHER).param("audiences", scope.audiences())
                .param("requireEmail", scope.requireEmail()).param("requirePhone", scope.requirePhone());
    }

    private Row map(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getObject("id", UUID.class), rs.getObject("author_user_id", UUID.class),
                rs.getObject("profile_id", UUID.class), rs.getObject("reply_to_id", UUID.class), rs.getString("body"),
                Audience.valueOf(rs.getString("audience")), rs.getString("status"), rs.getInt("like_count"),
                rs.getInt("reply_count"), rs.getTimestamp("created_at").toInstant(), rs.getString("username"),
                rs.getString("display_name"), rs.getString("avatar_url"), rs.getBoolean("author_verified"),
                rs.getBoolean("liked"), Audience.valueOf(rs.getString("profile_audience")));
    }
}
