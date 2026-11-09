package app.folyo.message;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Sayfa sahibinin engelledigi kisiler: ona ozel mesaj ve defter yazisi gonderemez. */
@Repository
public class BlockRepository {

    public record BlockedUser(UUID userId, String name, String avatarUrl, String username, Instant blockedAt) {
    }

    private final JdbcClient jdbc;

    BlockRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isBlocked(UUID ownerUserId, UUID userId) {
        return jdbc.sql("select exists(select 1 from user_blocks where owner_user_id = :owner and blocked_user_id = :user)")
                .param("owner", ownerUserId).param("user", userId).query(Boolean.class).single();
    }

    public void block(UUID ownerUserId, UUID userId) {
        jdbc.sql("insert into user_blocks (owner_user_id, blocked_user_id) values (:owner, :user) on conflict do nothing")
                .param("owner", ownerUserId).param("user", userId).update();
    }

    public void unblock(UUID ownerUserId, UUID userId) {
        jdbc.sql("delete from user_blocks where owner_user_id = :owner and blocked_user_id = :user")
                .param("owner", ownerUserId).param("user", userId).update();
    }

    public List<BlockedUser> list(UUID ownerUserId) {
        return jdbc.sql("""
                select u.id, u.name, u.avatar_url, p.username, b.created_at from user_blocks b
                join users u on u.id = b.blocked_user_id left join profiles p on p.user_id = u.id
                where b.owner_user_id = :owner order by b.created_at desc""")
                .param("owner", ownerUserId)
                .query((rs, i) -> new BlockedUser(rs.getObject("id", UUID.class), rs.getString("name"),
                        rs.getString("avatar_url"), rs.getString("username"), rs.getTimestamp("created_at").toInstant()))
                .list();
    }
}
