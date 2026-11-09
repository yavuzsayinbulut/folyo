package app.folyo.guestbook;

import app.folyo.access.InteractionPolicy;
import app.folyo.access.Viewer;
import app.folyo.access.ViewerService;
import app.folyo.auth.FolyoPrincipal;
import app.folyo.auth.User;
import app.folyo.auth.UserRepository;
import app.folyo.message.BlockRepository;
import app.folyo.moderation.ModerationService;
import app.folyo.notification.NotificationService;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestbookService {

    /** Bir kisi ayni sayfaya saatte en fazla bu kadar mesaj birakabilir; basit spam frenidir. */
    static final int MAX_ENTRIES_PER_HOUR = 5;
    /** Tum sayfalar toplami: bir hesap her sayfaya mesaj birakip herkese bildirim gonderemez. */
    static final int MAX_ENTRIES_PER_HOUR_TOTAL = 20;
    private static final Limit PAGE = Limit.of(50);

    private final GuestbookRepository entries;
    private final ProfileService profileService;
    private final UserRepository users;
    private final NotificationService notifications;
    private final ViewerService viewers;
    private final BlockRepository blocks;
    private final ModerationService moderation;

    public GuestbookService(GuestbookRepository entries, ProfileService profileService, UserRepository users,
            NotificationService notifications, ViewerService viewers, BlockRepository blocks, ModerationService moderation) {
        this.entries = entries;
        this.profileService = profileService;
        this.users = users;
        this.notifications = notifications;
        this.viewers = viewers;
        this.blocks = blocks;
        this.moderation = moderation;
    }

    /** Ziyaretcinin gorebilecegi mesajlar: sayfa ve defter kitlesi ziyaretciye aciksa. */
    @Transactional(readOnly = true)
    public List<GuestbookEntryView> visibleEntries(String username, FolyoPrincipal principal) {
        Profile profile = profileService.requireByUsername(username);
        Viewer viewer = viewers.viewer(principal, profile);
        if (!viewer.sees(profile.privacy().profile()) || !viewer.sees(profile.privacy().guestbook())) {
            return List.of();
        }
        return entries.findViews(profile.getId(), GuestbookStatus.VISIBLE, PAGE);
    }

    @Transactional(readOnly = true)
    public List<GuestbookEntryView> entriesForOwner(UUID ownerUserId) {
        return entries.findAllViews(profileService.requireByUserId(ownerUserId).getId(), PAGE);
    }

    /** Yazan kisi giris yapmis ve dogrulanmis olmali; sahip yorumlari kapatabilir ya da onaya baglayabilir. */
    @Transactional
    public UUID write(String username, FolyoPrincipal principal, String body) {
        // Bos mesaj @NotBlank ile yakalanir; uzunluk alt siniri burada, tek mesajla.
        if (body.strip().length() < 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mesaj en az 3 karakter olmalı");
        }
        UUID authorUserId = principal.userId();
        Profile profile = profileService.requireByUsername(username);
        // Yazarin satiri kilitlenir: ayni anda gelen istekler sayimi birlikte gecip siniri asamaz.
        User author = users.lockById(authorUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        moderation.requireCanWrite(authorUserId);
        moderation.checkText(body);
        Viewer viewer = viewers.viewer(principal, profile);
        if (!viewer.sees(profile.privacy().profile())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profil bulunamadı");
        }
        InteractionPolicy policy = profile.privacy().comments();
        switch (viewer.interaction(policy, blocks.isBlocked(profile.getUserId(), authorUserId))) {
            case ALLOWED, OWNER -> {
            }
            case VERIFY -> throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Deftere yazmak için önce hesabını doğrula");
            case CLOSED -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu sayfa yorumlara kapalı");
            default -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu sayfaya yazamazsın");
        }
        Instant hourAgo = Instant.now().minus(Duration.ofHours(1));
        if (entries.countByProfileIdAndAuthorUserIdAndCreatedAtAfter(profile.getId(), authorUserId, hourAgo)
                >= MAX_ENTRIES_PER_HOUR
                || entries.countByAuthorUserIdAndCreatedAtAfter(authorUserId, hourAgo) >= MAX_ENTRIES_PER_HOUR_TOTAL) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Çok sık mesaj gönderdin, biraz sonra tekrar dene");
        }
        boolean pending = policy == InteractionPolicy.APPROVAL && !viewer.owner();
        GuestbookEntry entry = entries.save(new GuestbookEntry(profile.getId(), authorUserId, body.strip(),
                pending ? GuestbookStatus.PENDING : GuestbookStatus.VISIBLE));
        if (pending) {
            notifications.enqueueGuestbookPending(profile, author.getName(), entry.getId());
        } else {
            notifications.enqueueGuestbookMessage(profile, authorUserId, author.getName(), entry.getId(), body.strip());
        }
        return entry.getId();
    }

    @Transactional
    public void changeStatus(UUID ownerUserId, UUID entryId, GuestbookStatus status) {
        ownedEntry(ownerUserId, entryId).changeStatus(status);
    }

    @Transactional
    public void delete(UUID ownerUserId, UUID entryId) {
        entries.delete(ownedEntry(ownerUserId, entryId));
    }

    private GuestbookEntry ownedEntry(UUID ownerUserId, UUID entryId) {
        Profile profile = profileService.requireByUserId(ownerUserId);
        return entries.findByIdAndProfileId(entryId, profile.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Mesaj bulunamadı"));
    }
}
