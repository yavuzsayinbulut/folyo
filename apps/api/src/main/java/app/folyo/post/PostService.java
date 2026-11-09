package app.folyo.post;

import app.folyo.access.Audience;
import app.folyo.access.Interaction;
import app.folyo.access.InteractionPolicy;
import app.folyo.access.Viewer;
import app.folyo.access.ViewerService;
import app.folyo.asset.Asset;
import app.folyo.asset.AssetKind;
import app.folyo.asset.AssetRepository;
import app.folyo.asset.AssetService;
import app.folyo.asset.AssetView;
import app.folyo.auth.FolyoPrincipal;
import app.folyo.auth.UserRepository;
import app.folyo.message.BlockRepository;
import app.folyo.notification.NotificationService;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileRepository;
import app.folyo.profile.ProfileService;
import app.folyo.settings.PlatformSettings;
import app.folyo.settings.VerificationPolicy;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Gonderiler. Yazi en fazla 500 karakter, en fazla 4 fotograf ya da 1 video. Yanitlar tek seviyedir ve gonderi
 * sahibinin yorum kuralina uyar. Gorunurluk: gonderinin kitlesi ve sayfanin kitlesi birlikte saglanmali.
 */
@Service
public class PostService {

    static final int MAX_BODY = 500;
    static final int MAX_PHOTOS = 4;
    static final int PAGE = 20;
    static final int MAX_POSTS_PER_HOUR = 30;
    static final int MAX_REPLIES_PER_HOUR = 60;

    private final PostRepository posts;
    private final AssetService assets;
    private final AssetRepository assetRepository;
    private final ProfileService profiles;
    private final ProfileRepository profileRepository;
    private final ViewerService viewers;
    private final PlatformSettings settings;
    private final BlockRepository blocks;
    private final UserRepository users;
    private final NotificationService notifications;

    public PostService(PostRepository posts, AssetService assets, AssetRepository assetRepository,
            ProfileService profiles, ProfileRepository profileRepository, ViewerService viewers,
            PlatformSettings settings, BlockRepository blocks, UserRepository users, NotificationService notifications) {
        this.posts = posts;
        this.assets = assets;
        this.assetRepository = assetRepository;
        this.profiles = profiles;
        this.profileRepository = profileRepository;
        this.viewers = viewers;
        this.settings = settings;
        this.blocks = blocks;
        this.users = users;
        this.notifications = notifications;
    }

    public record Author(String username, String displayName, String avatarUrl, boolean verified) {
    }

    public record PostView(UUID id, UUID replyToId, Author author, String body, List<AssetView> media,
            Audience audience, String status, int likeCount, int replyCount, boolean likedByMe, boolean mine,
            boolean canDelete, Instant createdAt) {
    }

    public record Page(List<PostView> posts, String next) {
    }

    public record Thread(PostView post, List<PostView> replies, Interaction replyInteraction, boolean repliesNeedApproval) {
    }

    public record CreateRequest(String body, List<UUID> mediaIds, Audience audience, UUID replyToId) {
    }

    @Transactional
    public PostView create(FolyoPrincipal principal, CreateRequest request) {
        UUID authorId = principal.userId();
        users.lockById(authorId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String body = request.body() == null ? null : request.body().strip();
        if (body != null && body.isEmpty()) {
            body = null;
        }
        if (body != null && body.codePointCount(0, body.length()) > MAX_BODY) {
            throw bad("Gönderi en fazla " + MAX_BODY + " karakter olabilir");
        }
        List<UUID> mediaIds = request.mediaIds() == null ? List.of() : request.mediaIds();
        if (body == null && mediaIds.isEmpty()) {
            throw bad("Bir şey yaz ya da fotoğraf/video ekle");
        }
        boolean reply = request.replyToId() != null;
        Instant hourAgo = Instant.now().minus(Duration.ofHours(1));
        if (posts.countByAuthorSince(authorId, reply, hourAgo) >= (reply ? MAX_REPLIES_PER_HOUR : MAX_POSTS_PER_HOUR)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Çok sık paylaşım yaptın, biraz sonra tekrar dene");
        }

        // Ust duzey gonderi yazarin sayfasinda yer alir; yanit icin sayfa gerekmez.
        UUID profileId = reply ? null : profiles.findByUserId(authorId).map(Profile::getId)
                .orElseThrow(() -> bad("Gönderi paylaşmak için önce sayfanın adresini al"));
        Audience audience = request.audience() == null ? Audience.EVERYONE : request.audience();
        String status = "VISIBLE";
        PostRepository.Row parent = null;
        if (reply) {
            parent = posts.find(request.replyToId(), scope(principal))
                    .filter(row -> row.replyToId() == null && canSee(row, principal))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gönderi bulunamadı"));
            Profile parentProfile = profileRepository.findById(parent.profileId()).orElseThrow();
            Interaction interaction = replyInteraction(parentProfile, principal);
            switch (interaction) {
                case ALLOWED, OWNER -> {
                }
                case VERIFY -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Yanıt yazmak için önce hesabını doğrula");
                case CLOSED -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu gönderi yanıtlara kapalı");
                default -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu gönderiye yanıt veremezsin");
            }
            // Yanit, ust gonderinin sayfasina ve kitlesine aittir.
            profileId = parent.profileId();
            audience = parent.audience();
            if (interaction == Interaction.ALLOWED
                    && parentProfile.privacy().comments() == InteractionPolicy.APPROVAL) {
                status = "PENDING";
            }
        }

        List<Asset> media = assets.attach(authorId, mediaIds);
        long videos = media.stream().filter(a -> a.kind() == AssetKind.VIDEO).count();
        if (videos > 1 || (videos == 1 && media.size() > 1) || media.size() > MAX_PHOTOS) {
            throw bad("En fazla " + MAX_PHOTOS + " fotoğraf ya da 1 video ekleyebilirsin");
        }

        UUID id = UUID.randomUUID();
        posts.insert(id, authorId, profileId, reply ? parent.id() : null, body, audience, status);
        posts.insertMedia(id, mediaIds);
        if (reply) {
            posts.lock(parent.id());
            if ("VISIBLE".equals(status)) {
                posts.changeReplyCount(parent.id(), 1);
            }
            if (!parent.authorId().equals(authorId)) {
                notifications.enqueuePostReply(parent.authorId(), principal.name(), parent.id(), id, body,
                        "PENDING".equals(status));
            }
        }
        return view(posts.find(id, scope(principal)).orElseThrow(), principal, mediaMap(List.of(id)));
    }

    @Transactional
    public void delete(FolyoPrincipal principal, UUID postId) {
        PostRepository.Row row = posts.find(postId, scope(principal))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gönderi bulunamadı"));
        if (!canDelete(row, principal)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Gönderi bulunamadı");
        }
        posts.lock(postId);
        if (row.replyToId() != null && "VISIBLE".equals(row.status())) {
            posts.changeReplyCount(row.replyToId(), -1);
        }
        List<UUID> mediaIds = posts.mediaIds(List.of(postId)).getOrDefault(postId, List.of());
        List<Asset> media = assetRepository.findAll(mediaIds);
        posts.delete(postId);
        assets.deleteWithFiles(media);
    }

    @Transactional
    public PostView approve(FolyoPrincipal principal, UUID replyId) {
        PostRepository.Row reply = posts.find(replyId, scope(principal))
                .filter(r -> r.replyToId() != null && "PENDING".equals(r.status()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Yanıt bulunamadı"));
        PostRepository.Row parent = posts.find(reply.replyToId(), scope(principal)).orElseThrow();
        if (!parent.authorId().equals(principal.userId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Yanıt bulunamadı");
        }
        posts.lock(parent.id());
        posts.approve(replyId);
        posts.changeReplyCount(parent.id(), 1);
        return view(posts.find(replyId, scope(principal)).orElseThrow(), principal, mediaMap(List.of(replyId)));
    }

    @Transactional
    public PostView like(FolyoPrincipal principal, UUID postId, boolean like) {
        PostRepository.Row row = posts.find(postId, scope(principal)).filter(r -> canSee(r, principal))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gönderi bulunamadı"));
        if (like) {
            posts.like(row.id(), principal.userId());
        } else {
            posts.unlike(row.id(), principal.userId());
        }
        return view(posts.find(postId, scope(principal)).orElseThrow(), principal, mediaMap(List.of(postId)));
    }

    @Transactional(readOnly = true)
    public Page profileFeed(String username, FolyoPrincipal principal, String cursor) {
        Profile profile = profiles.requireByUsername(username);
        Viewer viewer = viewers.viewer(principal, profile);
        if (!viewer.sees(profile.privacy().profile())) {
            return new Page(List.of(), null);
        }
        Cursor c = Cursor.parse(cursor);
        return page(posts.profileTimeline(profile.getId(), scope(principal), c.time(), c.id(), PAGE + 1), principal);
    }

    @Transactional(readOnly = true)
    public Page explore(FolyoPrincipal principal, String cursor) {
        Cursor c = Cursor.parse(cursor);
        return page(posts.explore(scope(principal), c.time(), c.id(), PAGE + 1), principal);
    }

    @Transactional(readOnly = true)
    public Thread thread(UUID postId, FolyoPrincipal principal) {
        PostRepository.Row row = posts.find(postId, scope(principal)).filter(r -> canSee(r, principal))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gönderi bulunamadı"));
        if (row.replyToId() != null) {
            // Yanitin adresi acilirsa ust gonderiyle birlikte gosterilir.
            return thread(row.replyToId(), principal);
        }
        List<PostRepository.Row> replies = posts.replies(row.id(), row.authorId(), scope(principal), 200);
        List<UUID> ids = new ArrayList<>();
        ids.add(row.id());
        replies.forEach(r -> ids.add(r.id()));
        Map<UUID, List<AssetView>> media = mediaMap(ids);
        Profile profile = profileRepository.findById(row.profileId()).orElseThrow();
        return new Thread(view(row, principal, media), replies.stream().map(r -> view(r, principal, media)).toList(),
                replyInteraction(profile, principal), profile.privacy().comments() == InteractionPolicy.APPROVAL);
    }

    /** Medya okunurken: gonderiyi gorebilen fotografini da gorur. */
    @Transactional(readOnly = true)
    public boolean canSeePost(UUID postId, FolyoPrincipal principal) {
        return posts.find(postId, scope(principal)).filter(r -> canSee(r, principal)).isPresent();
    }

    private Interaction replyInteraction(Profile profile, FolyoPrincipal principal) {
        Viewer viewer = viewers.viewer(principal, profile);
        boolean blocked = viewer.signedIn() && !viewer.owner() && blocks.isBlocked(profile.getUserId(), viewer.userId());
        return viewer.interaction(profile.privacy().comments(), blocked);
    }

    private Page page(List<PostRepository.Row> rows, FolyoPrincipal principal) {
        String next = null;
        if (rows.size() > PAGE) {
            rows = rows.subList(0, PAGE);
            PostRepository.Row last = rows.getLast();
            next = Cursor.of(last.createdAt(), last.id());
        }
        Map<UUID, List<AssetView>> media = mediaMap(rows.stream().map(PostRepository.Row::id).toList());
        return new Page(rows.stream().map(r -> view(r, principal, media)).toList(), next);
    }

    private Map<UUID, List<AssetView>> mediaMap(List<UUID> postIds) {
        Map<UUID, List<UUID>> ids = posts.mediaIds(postIds);
        Map<UUID, Asset> byId = assetRepository.findAll(ids.values().stream().flatMap(List::stream).toList()).stream()
                .collect(Collectors.toMap(Asset::id, Function.identity()));
        return ids.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,
                e -> e.getValue().stream().map(byId::get).filter(java.util.Objects::nonNull).map(AssetView::from).toList()));
    }

    private PostView view(PostRepository.Row r, FolyoPrincipal principal, Map<UUID, List<AssetView>> media) {
        boolean mine = principal != null && r.authorId().equals(principal.userId());
        return new PostView(r.id(), r.replyToId(), new Author(r.username(), r.displayName(), r.avatarUrl(), r.authorVerified()),
                r.body(), media.getOrDefault(r.id(), List.of()), mine ? r.audience() : null, r.status(), r.likeCount(),
                r.replyCount(), r.likedByViewer(), mine, canDelete(r, principal), r.createdAt());
    }

    /** Yazar her zaman; yanitlari ust gonderinin sahibi de silebilir (kendi sayfasini temizler). */
    private boolean canDelete(PostRepository.Row r, FolyoPrincipal principal) {
        if (principal == null) {
            return false;
        }
        if (r.authorId().equals(principal.userId())) {
            return true;
        }
        return r.replyToId() != null && profileRepository.findById(r.profileId())
                .map(p -> p.getUserId().equals(principal.userId())).orElse(false);
    }

    private boolean canSee(PostRepository.Row r, FolyoPrincipal principal) {
        if (principal != null && r.authorId().equals(principal.userId())) {
            return true;
        }
        Profile profile = profileRepository.findById(r.profileId()).orElse(null);
        if (profile == null) {
            return false;
        }
        Viewer viewer = viewers.viewer(principal, profile);
        if (viewer.owner()) {
            return true;
        }
        return "VISIBLE".equals(r.status()) && viewer.sees(r.audience()) && viewer.sees(profile.privacy().profile());
    }

    PostRepository.Scope scope(FolyoPrincipal principal) {
        VerificationPolicy policy = settings.policy();
        List<String> audiences = new ArrayList<>(List.of(Audience.EVERYONE.name()));
        if (principal != null) {
            audiences.add(Audience.SIGNED_IN.name());
            if (viewers.status(principal.userId()).verified()) {
                audiences.add(Audience.VERIFIED.name());
            }
        }
        return new PostRepository.Scope(principal == null ? null : principal.userId(), audiences, policy.requireEmail(),
                policy.requirePhone());
    }

    /** Sayfalama imleci: son gonderinin zamani ve kimligi (base64url). */
    record Cursor(Instant time, UUID id) {

        static String of(Instant time, UUID id) {
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString((time + "|" + id).getBytes(StandardCharsets.UTF_8));
        }

        static Cursor parse(String value) {
            if (value == null || value.isBlank()) {
                return new Cursor(null, null);
            }
            try {
                String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|");
                return new Cursor(Instant.parse(parts[0]), UUID.fromString(parts[1]));
            } catch (RuntimeException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Geçersiz sayfa imleci");
            }
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
