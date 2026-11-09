package app.folyo.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import app.folyo.access.Audience;
import app.folyo.access.InteractionPolicy;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "profiles")
public class Profile {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(nullable = false, updatable = false)
    private String username;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    private String bio;
    private String location;
    private String timezone;
    private String status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProfileVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProfileTheme theme;

    @Enumerated(EnumType.STRING)
    private ProfileAccent accent;

    @Enumerated(EnumType.STRING)
    @Column(name = "profile_audience", nullable = false)
    private Audience profileAudience;

    @Enumerated(EnumType.STRING)
    @Column(name = "location_audience", nullable = false)
    private Audience locationAudience;

    @Enumerated(EnumType.STRING)
    @Column(name = "local_time_audience", nullable = false)
    private Audience localTimeAudience;

    @Enumerated(EnumType.STRING)
    @Column(name = "activity_audience", nullable = false)
    private Audience activityAudience;

    @Enumerated(EnumType.STRING)
    @Column(name = "guestbook_audience", nullable = false)
    private Audience guestbookAudience;

    @Enumerated(EnumType.STRING)
    @Column(name = "comment_policy", nullable = false)
    private InteractionPolicy commentPolicy;

    @Enumerated(EnumType.STRING)
    @Column(name = "message_policy", nullable = false)
    private InteractionPolicy messagePolicy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Profile() {
    }

    public Profile(UUID userId, String username, String displayName) {
        this.userId = userId;
        this.username = username;
        this.displayName = displayName;
        this.visibility = ProfileVisibility.PUBLIC;
        this.theme = ProfileTheme.CLASSIC;
        applyPrivacy(PrivacySettings.DEFAULT);
    }

    public void applyPrivacy(PrivacySettings p) {
        this.visibility = p.indexable() ? ProfileVisibility.PUBLIC : ProfileVisibility.UNLISTED;
        this.profileAudience = p.profile();
        this.locationAudience = p.location();
        this.localTimeAudience = p.localTime();
        this.activityAudience = p.activity();
        this.guestbookAudience = p.guestbook();
        this.commentPolicy = p.comments();
        this.messagePolicy = p.messages();
    }

    public PrivacySettings privacy() {
        return new PrivacySettings(visibility == ProfileVisibility.PUBLIC, profileAudience, locationAudience,
                localTimeAudience, activityAudience, guestbookAudience, commentPolicy, messagePolicy);
    }

    public void changeAppearance(ProfileTheme theme, ProfileAccent accent) {
        this.theme = theme;
        this.accent = accent;
    }

    public void updateDetails(String displayName, String bio, String location, String timezone, String status,
            ProfileVisibility visibility) {
        this.displayName = displayName;
        this.bio = bio;
        this.location = location;
        this.timezone = timezone;
        this.status = status;
        this.visibility = visibility;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getUsername() {
        return username;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getBio() {
        return bio;
    }

    public String getLocation() {
        return location;
    }

    public String getTimezone() {
        return timezone;
    }

    public String getStatus() {
        return status;
    }

    public ProfileTheme getTheme() {
        return theme;
    }

    public ProfileAccent getAccent() {
        return accent;
    }

    public ProfileVisibility getVisibility() {
        return visibility;
    }
}
