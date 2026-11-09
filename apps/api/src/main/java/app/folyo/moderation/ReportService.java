package app.folyo.moderation;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.chat.ChatService;
import app.folyo.message.BlockRepository;
import app.folyo.post.PostService;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileService;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sikayetler. Kisi yalniz gorebildigi baskasinin icerigini sikayet eder; ayni icerigi bir kez (acik kaldikca),
 * gunde sinirli sayida. Belirli sayida farkli kisi sikayet edince gonderi ve defter yazisi inceleme bitene kadar
 * gizlenir. Yonetici karari: icerigi kaldir ya da uygun bul (gizlenmisse geri acilir), istenirse yazari askiya al.
 */
@Service
public class ReportService {

    public enum TargetType {
        POST, MESSAGE, PROFILE, GUESTBOOK
    }

    public enum Reason {
        SPAM, HARASSMENT, HATE, SEXUAL, VIOLENCE, SELF_HARM, IMPERSONATION, ILLEGAL, OTHER
    }

    public enum Action {
        REMOVE, DISMISS
    }

    public record ReportRequest(TargetType targetType, String targetId, Reason reason, String note, Boolean block) {
    }

    /** hidden: bu sikayetle icerik incelemeye alinip gizlendi. alreadyReported: daha once sikayet etmistin. */
    public record ReportResult(boolean alreadyReported, boolean hidden) {
    }

    /** Sikayet edilen icerik: saklanan kimlik, sahibi, inceleme icin ozeti, sayfadaki adresi. */
    record Target(TargetType type, String id, UUID ownerId, String snapshot, String link) {
    }

    public record ReportItem(String reason, String note, Instant at) {
    }

    public record Author(UUID id, String name, String username, boolean suspended) {
    }

    /** Ayni icerige gelen sikayetler tek satirda. */
    public record ReportGroup(TargetType targetType, String targetId, Author author, String snapshot, String link,
            Map<String, Integer> reasons, List<ReportItem> reports, int count, boolean hidden, String status,
            Instant firstAt, Instant lastAt) {
    }

    private final JdbcClient jdbc;
    private final ModerationService moderation;
    private final PostService posts;
    private final ChatService chats;
    private final ProfileService profiles;
    private final BlockRepository blocks;

    public ReportService(JdbcClient jdbc, ModerationService moderation, PostService posts, ChatService chats,
            ProfileService profiles, BlockRepository blocks) {
        this.jdbc = jdbc;
        this.moderation = moderation;
        this.posts = posts;
        this.chats = chats;
        this.profiles = profiles;
        this.blocks = blocks;
    }

    @Transactional
    public ReportResult report(FolyoPrincipal principal, ReportRequest request) {
        UUID me = principal.userId();
        if (request.targetType() == null || request.targetId() == null || request.reason() == null) {
            throw bad("Bir neden seç");
        }
        String note = request.note() == null || request.note().isBlank() ? null : request.note().strip();
        if (note != null && note.length() > 500) {
            throw bad("Açıklama en fazla 500 karakter olabilir");
        }
        // Kisi bazinda siralanir: ayni anda gelen sikayetler gunluk siniri birlikte gecemez.
        jdbc.sql("select id from users where id = :id for update").param("id", me).query(UUID.class).optional();
        long today = jdbc.sql("select count(*) from reports where reporter_id = :me and created_at > :since")
                .param("me", me).param("since", Timestamp.from(Instant.now().minus(Duration.ofDays(1))))
                .query(Long.class).single();
        if (today >= moderation.policy().dailyLimit()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bugün çok sayıda şikayet gönderdin; yarın tekrar dene");
        }

        Target target = resolve(request.targetType(), request.targetId(), principal);
        if (me.equals(target.ownerId())) {
            throw bad("Kendi içeriğini şikayet edemezsin");
        }
        int inserted = jdbc.sql("""
                insert into reports (id, reporter_id, target_type, target_id, target_user_id, reason, note, snapshot)
                values (:id, :me, :type, :target, :owner, :reason, :note, :snapshot)
                on conflict (reporter_id, target_type, target_id) where status = 'OPEN' do nothing""")
                .param("id", UUID.randomUUID()).param("me", me).param("type", target.type().name())
                .param("target", target.id()).param("owner", target.ownerId()).param("reason", request.reason().name())
                .param("note", note).param("snapshot", truncate(target.snapshot(), 4000)).update();
        if (Boolean.TRUE.equals(request.block()) && target.ownerId() != null) {
            blocks.block(me, target.ownerId());
        }
        boolean hidden = inserted == 1 && hideIfThresholdReached(target);
        return new ReportResult(inserted == 0, hidden);
    }

    /** Acik sikayetler (ya da son kararlar), icerige gore gruplanmis; en cok sikayet edilen once. */
    @Transactional(readOnly = true)
    public List<ReportGroup> queue(boolean open) {
        List<Map<String, Object>> rows = jdbc.sql("""
                select r.target_type, r.target_id, r.target_user_id, r.reason, r.note, r.snapshot, r.status, r.created_at,
                       u.name, u.suspended_at is not null as suspended, p.username,
                       exists(select 1 from moderation_holds h where h.target_type = r.target_type and h.target_id = r.target_id) as held
                from reports r
                left join users u on u.id = r.target_user_id
                left join profiles p on p.user_id = r.target_user_id
                where\s""" + (open ? "r.status = 'OPEN'" : "r.status <> 'OPEN' and r.resolved_at > now() - interval '30 days'") + """

                order by r.created_at desc
                limit 1000""").query().listOfRows();
        Map<String, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            grouped.computeIfAbsent(row.get("target_type") + ":" + row.get("target_id"), k -> new ArrayList<>()).add(row);
        }
        List<ReportGroup> groups = new ArrayList<>();
        for (List<Map<String, Object>> list : grouped.values()) {
            Map<String, Object> latest = list.getFirst();
            Map<String, Integer> reasons = new LinkedHashMap<>();
            List<ReportItem> items = new ArrayList<>();
            for (Map<String, Object> row : list) {
                reasons.merge((String) row.get("reason"), 1, Integer::sum);
                items.add(new ReportItem((String) row.get("reason"), (String) row.get("note"), instant(row.get("created_at"))));
            }
            UUID authorId = (UUID) latest.get("target_user_id");
            TargetType type = TargetType.valueOf((String) latest.get("target_type"));
            String targetId = (String) latest.get("target_id");
            String username = (String) latest.get("username");
            groups.add(new ReportGroup(type, targetId,
                    authorId == null ? null : new Author(authorId, (String) latest.get("name"), username,
                            Boolean.TRUE.equals(latest.get("suspended"))),
                    (String) latest.get("snapshot"), link(type, targetId, username), reasons, items.stream().limit(10).toList(),
                    list.size(), Boolean.TRUE.equals(latest.get("held")), (String) latest.get("status"),
                    instant(list.getLast().get("created_at")), instant(latest.get("created_at"))));
        }
        groups.sort((a, b) -> open ? Integer.compare(b.count(), a.count()) : b.lastAt().compareTo(a.lastAt()));
        return groups;
    }

    /** Yonetici karari; ayni icerikteki tum acik sikayetler kapanir. */
    @Transactional
    public void resolve(UUID adminId, TargetType type, String targetId, Action action, boolean suspendAuthor, String reason) {
        UUID ownerId = jdbc.sql("""
                select target_user_id from reports where target_type = :type and target_id = :id and status = 'OPEN'
                limit 1""").param("type", type.name()).param("id", targetId).query(UUID.class).optional().orElse(null);
        long open = jdbc.sql("select count(*) from reports where target_type = :type and target_id = :id and status = 'OPEN'")
                .param("type", type.name()).param("id", targetId).query(Long.class).single();
        if (open == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bu içerik için açık şikayet yok");
        }
        boolean held = jdbc.sql("delete from moderation_holds where target_type = :type and target_id = :id")
                .param("type", type.name()).param("id", targetId).update() == 1;
        if (action == Action.REMOVE) {
            switch (type) {
                case POST -> posts.removeByModerator(UUID.fromString(targetId));
                case MESSAGE -> chats.removeByModerator(Long.parseLong(targetId));
                case GUESTBOOK -> jdbc.sql("delete from guestbook_entries where id = :id")
                        .param("id", UUID.fromString(targetId)).update();
                case PROFILE -> throw bad("Sayfa kaldırılamaz; gerekiyorsa sahibini askıya al");
            }
        } else if (held) {
            switch (type) {
                case POST -> posts.restoreAfterModeration(UUID.fromString(targetId));
                case GUESTBOOK -> jdbc.sql("update guestbook_entries set status = 'VISIBLE' where id = :id and status = 'HIDDEN'")
                        .param("id", UUID.fromString(targetId)).update();
                default -> {
                }
            }
        }
        jdbc.sql("""
                update reports set status = :status, resolved_by = :admin, resolved_at = now()
                where target_type = :type and target_id = :id and status = 'OPEN'""")
                .param("status", action == Action.REMOVE ? "REMOVED" : "DISMISSED").param("admin", adminId)
                .param("type", type.name()).param("id", targetId).update();
        if (suspendAuthor && ownerId != null) {
            suspend(ownerId, reason);
        }
    }

    public record Suspension(UUID userId, String name, String username, String reason, Instant at) {
    }

    @Transactional
    public void suspend(UUID userId, String reason) {
        String text = reason == null || reason.isBlank() ? "Topluluk kurallarına aykırı içerik" : reason.strip();
        int updated = jdbc.sql("""
                update users set suspended_at = coalesce(suspended_at, now()), suspension_reason = :reason where id = :id""")
                .param("reason", truncate(text, 300)).param("id", userId).update();
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Kullanıcı bulunamadı");
        }
    }

    @Transactional
    public void unsuspend(UUID userId) {
        jdbc.sql("update users set suspended_at = null, suspension_reason = null where id = :id").param("id", userId).update();
    }

    @Transactional(readOnly = true)
    public List<Suspension> suspensions() {
        return jdbc.sql("""
                select u.id, u.name, p.username, u.suspension_reason, u.suspended_at
                from users u left join profiles p on p.user_id = u.id
                where u.suspended_at is not null order by u.suspended_at desc limit 200""")
                .query((rs, i) -> new Suspension(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getString(4), rs.getTimestamp(5).toInstant()))
                .list();
    }

    @Transactional(readOnly = true)
    public long openCount() {
        return jdbc.sql("select count(distinct (target_type, target_id)) from reports where status = 'OPEN'")
                .query(Long.class).single();
    }

    // --- hedefler ---

    private Target resolve(TargetType type, String rawId, FolyoPrincipal principal) {
        UUID me = principal.userId();
        return switch (type) {
            case POST -> posts.reportable(uuid(rawId), principal)
                    .map(p -> new Target(type, p.id().toString(), p.authorId(), p.preview(), null))
                    .orElseThrow(ReportService::notFound);
            case MESSAGE -> chats.reportable(messageId(rawId), me)
                    .map(m -> new Target(type, Long.toString(m.id()), m.senderId(), m.preview(), null))
                    .orElseThrow(ReportService::notFound);
            case PROFILE -> {
                Profile profile = profiles.requireByUsername(rawId);
                String bio = profile.getBio() == null ? "" : " — " + profile.getBio();
                yield new Target(type, profile.getUsername(), profile.getUserId(), profile.getDisplayName() + bio, null);
            }
            case GUESTBOOK -> jdbc.sql("""
                    select e.id, e.author_user_id, e.body from guestbook_entries e join profiles p on p.id = e.profile_id
                    where e.id = :id and (e.status = 'VISIBLE' or p.user_id = :me)""")
                    .param("id", uuid(rawId)).param("me", me)
                    .query((rs, i) -> new Target(type, rs.getObject(1, UUID.class).toString(), rs.getObject(2, UUID.class),
                            rs.getString(3), null))
                    .optional().orElseThrow(ReportService::notFound);
        };
    }

    private boolean hideIfThresholdReached(Target target) {
        if (target.type() != TargetType.POST && target.type() != TargetType.GUESTBOOK) {
            return false;
        }
        long reporters = jdbc.sql("""
                select count(distinct reporter_id) from reports where target_type = :type and target_id = :id and status = 'OPEN'""")
                .param("type", target.type().name()).param("id", target.id()).query(Long.class).single();
        if (reporters < moderation.policy().threshold()) {
            return false;
        }
        boolean hidden = target.type() == TargetType.POST
                ? posts.hideForModeration(UUID.fromString(target.id()))
                : jdbc.sql("update guestbook_entries set status = 'HIDDEN' where id = :id and status = 'VISIBLE'")
                        .param("id", UUID.fromString(target.id())).update() == 1;
        if (hidden) {
            jdbc.sql("insert into moderation_holds (target_type, target_id) values (:type, :id) on conflict do nothing")
                    .param("type", target.type().name()).param("id", target.id()).update();
        }
        return hidden;
    }

    private static String link(TargetType type, String targetId, String username) {
        return switch (type) {
            case POST -> "/p/" + targetId;
            case PROFILE -> "/" + targetId;
            case GUESTBOOK -> username == null ? null : "/" + username;
            case MESSAGE -> null;
        };
    }

    private static UUID uuid(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw notFound();
        }
    }

    private static long messageId(String raw) {
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw notFound();
        }
    }

    private static String truncate(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max);
    }

    private static Instant instant(Object value) {
        return value instanceof Timestamp t ? t.toInstant() : value instanceof java.time.OffsetDateTime o ? o.toInstant() : (Instant) value;
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "İçerik bulunamadı");
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
