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

    /** Akislarda: bakan kisiyle yazar arasinda iki yonden biri engellediyse gonderi gosterilmez. */
    private static final String NOT_BLOCKED = """
            (cast(:viewer as uuid) is null or not exists (select 1 from user_blocks b
              where (b.owner_user_id = cast(:viewer as uuid) and b.blocked_user_id = p.author_user_id)
                 or (b.owner_user_id = p.author_user_id and b.blocked_user_id = cast(:viewer as uuid))))
            """;

    /** Kesfet'e girebilen gonderi: ust duzey, herkese gorunur, kitlesi ve sayfasi bakan kisiye acik, yazari dogrulanmis. */
    private static final String EXPLORABLE = """
            p.reply_to_id is null and p.status = 'VISIBLE'
             and p.audience in (:audiences) and pr.profile_audience in (:audiences)
             and (not :requireEmail or u.email_verified_at is not null)
             and (not :requirePhone or u.phone_verified_at is not null)
             and\s""" + NOT_BLOCKED;

    /**
     * "Senin icin": en yeni adaylar puanlanir. Puan etkilesim / yas^gravity; bakan kisinin begendigi, yanitladigi ya da
     * sohbet ettigi yazarlar sinirli bir carpanla one cikar; ayni yazarin her sonraki gonderisi diversityDecay ile
     * zayiflar. Tum hesap tek sorguda, aday havuzu (en yeni N) ile sinirlidir; indeks ix_posts_explore kullanilir.
     */
    private static final String RANKED = """
            with candidates as (
                select p.id, p.author_user_id, p.like_count, p.reply_count, p.created_at
                from posts p
                join profiles pr on pr.id = p.profile_id
                join users u on u.id = p.author_user_id
                where\s""" + EXPLORABLE + """
                  and p.created_at <= cast(:asOf as timestamptz)
                  and (cast(:viewer as uuid) is null or p.author_user_id <> cast(:viewer as uuid))
                order by p.created_at desc, p.id desc
                limit :pool
            ),
            affinity as (
                select author, least(sum(weight), :affinityCap) as weight from (
                    select p.author_user_id as author, 1 as weight
                    from post_likes l join posts p on p.id = l.post_id
                    where l.user_id = cast(:viewer as uuid) and l.created_at > cast(:since as timestamptz)
                    union all
                    select parent.author_user_id, 2
                    from posts r join posts parent on parent.id = r.reply_to_id
                    where r.author_user_id = cast(:viewer as uuid) and r.created_at > cast(:since as timestamptz)
                    union all
                    select case when c.user_low = m.user_id then c.user_high else c.user_low end, 3
                    from conversation_members m join conversations c on c.id = m.conversation_id
                    where m.user_id = cast(:viewer as uuid) and m.state = 'ACTIVE'
                      and c.last_message_at > cast(:since as timestamptz)
                ) signals
                group by author
            ),
            scored as (
                select c.id, c.author_user_id, c.created_at,
                       (c.like_count + :replyWeight * c.reply_count + 1)
                         / power(greatest(extract(epoch from (cast(:asOf as timestamptz) - c.created_at)) / 3600.0, 0) + 2, :gravity)
                         * (1 + coalesce(a.weight, 0) * :affinityStep) as score
                from candidates c
                left join affinity a on a.author = c.author_user_id
            ),
            diversified as (
                select id, created_at,
                       score * power(:diversityDecay, row_number() over (partition by author_user_id order by score desc, id) - 1) as rank_score
                from scored
            )
            select id from diversified
            order by rank_score desc, created_at desc, id desc
            limit :size
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

    /** Kesfet (en yeni): herkesin gorebildigi, dogrulanmis hesaplarin ust duzey gonderileri, yeniden eskiye. */
    List<Row> explore(Scope scope, Instant beforeTime, UUID beforeId, int limit) {
        return bind(jdbc.sql(SELECT + " where " + EXPLORABLE + cursor(beforeTime)
                + " order by p.created_at desc, p.id desc limit :limit"), scope)
                .param("limit", limit).params(cursorParams(beforeTime, beforeId)).query(this::map).list();
    }

    /** "Senin icin" siralamasi: asOf anina gore puanlanmis gonderi kimlikleri. */
    List<UUID> rankForYou(Scope scope, Instant asOf, FeedProperties feed) {
        return bind(jdbc.sql(RANKED), scope)
                .param("asOf", Timestamp.from(asOf))
                .param("since", Timestamp.from(asOf.minus(feed.affinityWindow())))
                .param("pool", feed.candidatePool())
                .param("size", feed.snapshotSize())
                .param("gravity", feed.gravity())
                .param("replyWeight", feed.replyWeight())
                .param("affinityStep", feed.affinityStep())
                .param("affinityCap", feed.affinityCap())
                .param("diversityDecay", feed.diversityDecay())
                .query(UUID.class).list();
    }

    /** Siralanmis listenin bir sayfasi; gorunurluk o anki kurallarla yeniden kontrol edilir (silinen/gizlenen dusar). */
    List<Row> explorable(Collection<UUID> ids, Scope scope) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return bind(jdbc.sql(SELECT + " where p.id in (:ids) and " + EXPLORABLE), scope)
                .param("ids", ids).query(this::map).list();
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
