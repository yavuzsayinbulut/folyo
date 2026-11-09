package app.folyo.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @Column(name = "auth_provider", nullable = false)
    private String authProvider;

    @Column(name = "auth_subject", nullable = false)
    private String authSubject;

    private String email;

    @Column(nullable = false)
    private String name;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false, insertable = false, updatable = false)
    private String role;

    @Column(name = "email_verified_at", insertable = false, updatable = false)
    private Instant emailVerifiedAt;

    @Column(insertable = false, updatable = false)
    private String phone;

    @Column(name = "phone_verified_at", insertable = false, updatable = false)
    private Instant phoneVerifiedAt;

    @Column(name = "avatar_asset_id", insertable = false, updatable = false)
    private java.util.UUID avatarAssetId;

    @Column(name = "last_seen_at", insertable = false, updatable = false)
    private Instant lastSeenAt;

    @Column(name = "last_seen_audience", insertable = false, updatable = false)
    private String lastSeenAudience;

    @Column(name = "read_receipts", insertable = false, updatable = false)
    private boolean readReceipts;

    protected User() {
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getName() {
        return name;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }

    public Instant getEmailVerifiedAt() {
        return emailVerifiedAt;
    }

    public String getPhone() {
        return phone;
    }

    public Instant getPhoneVerifiedAt() {
        return phoneVerifiedAt;
    }

    public java.util.UUID getAvatarAssetId() {
        return avatarAssetId;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public String getLastSeenAudience() {
        return lastSeenAudience;
    }

    public boolean isReadReceipts() {
        return readReceipts;
    }
}
