package app.folyo.chat;

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
import app.folyo.auth.User;
import app.folyo.auth.UserRepository;
import app.folyo.message.BlockRepository;
import app.folyo.notification.NotificationService;
import app.folyo.profile.Profile;
import app.folyo.profile.ProfileService;
import app.folyo.realtime.RealtimeHub;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

/**
 * Iki kisilik sohbet. Ilk mesaj sayfa sahibinin "kim mesaj atabilir" kuralina uyar; bilinmeyen kisiden gelen sohbet
 * sahip "onayimdan sonra" sectiyse Istekler'e duser ve kabul edilene kadar en fazla 5 mesaj gonderilebilir.
 * Tikler: tek = sunucuya ulasti, cift = aliciya ulasti, mavi = okundu (iki taraf da okundu bilgisini aciksa).
 */
@Service
public class ChatService {

    static final int MAX_BODY = 4000;
    static final int MAX_CAPTION = 1000;
    static final int MAX_UNANSWERED_REQUEST = 5;
    static final Duration DELETE_WINDOW = Duration.ofHours(48);
    private static final int PAGE = 50;

    private final ChatRepository chats;
    private final ProfileService profiles;
    private final UserRepository users;
    private final ViewerService viewers;
    private final BlockRepository blocks;
    private final AssetService assets;
    private final AssetRepository assetRepository;
    private final StickerCatalog stickers;
    private final RealtimeHub hub;
    private final NotificationService notifications;
    /** Commit sonrasi isler (tik guncellemesi, bildirim kuyrugu) kendi transaction'inda calisir; aksi halde kaybolur. */
    private final TransactionTemplate afterCommitTx;

    public ChatService(ChatRepository chats, ProfileService profiles, UserRepository users, ViewerService viewers,
            BlockRepository blocks, AssetService assets, AssetRepository assetRepository, StickerCatalog stickers,
            RealtimeHub hub, NotificationService notifications, PlatformTransactionManager transactionManager) {
        this.afterCommitTx = new TransactionTemplate(transactionManager);
        this.afterCommitTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.chats = chats;
        this.profiles = profiles;
        this.users = users;
        this.viewers = viewers;
        this.blocks = blocks;
        this.assets = assets;
        this.assetRepository = assetRepository;
        this.stickers = stickers;
        this.hub = hub;
        this.notifications = notifications;
    }

    // --- gorunumler ---

    public record Presence(boolean online, Instant lastSeenAt) {
    }

    public record Person(UUID userId, String name, String username, String avatarUrl) {
    }

    public record MessageView(long id, long seq, UUID senderId, boolean mine, MessageKind kind, String body,
            String sticker, String stickerUrl, AssetView asset, Instant createdAt, boolean deleted) {
    }

    /**
     * otherReadSeq yalniz iki taraf da okundu bilgisini acik tuttuysa doludur; degilse istemci en fazla cift (gri)
     * tik gosterir. presence, karsi tarafin gizlilik secimine gore bos olabilir.
     */
    public record ConversationView(UUID id, Person other, MemberState state, long unread, MessageView lastMessage,
            Instant lastMessageAt, long otherDeliveredSeq, Long otherReadSeq, Presence presence, boolean startedByMe) {
    }

    public record Thread(ConversationView conversation, List<MessageView> messages, Long nextBefore) {
    }

    public record SendRequest(String clientId, MessageKind kind, String body, UUID assetId, String sticker) {
    }

    public record Started(UUID conversationId, MessageView message) {
    }

    public record Unread(long chats, long requests) {
    }

    public record Settings(LastSeenAudience lastSeenAudience, boolean readReceipts) {
    }

    // --- baslatma ve gonderme ---

    /** Profildeki "Mesaj gonder": sohbet yoksa acilir, ilk mesaj gonderilir. */
    @Transactional
    public Started startFromProfile(FolyoPrincipal principal, String username, String body) {
        Profile profile = profiles.requireByUsername(username);
        UUID me = principal.userId();
        User sender = users.lockById(me).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Viewer viewer = viewers.viewer(principal, profile);
        if (!viewer.sees(profile.privacy().profile())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profil bulunamadı");
        }
        UUID ownerId = profile.getUserId();
        ChatRepository.Conversation existing = chats.between(me, ownerId).orElse(null);
        if (existing == null) {
            Interaction interaction = viewer.interaction(profile.privacy().messages(), blocks.isBlocked(ownerId, me));
            switch (interaction) {
                case ALLOWED -> {
                }
                case OWNER -> throw bad("Kendine mesaj gönderemezsin");
                case VERIFY -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Mesaj göndermek için önce hesabını doğrula");
                case CLOSED -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu sayfa mesaj almıyor");
                default -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu kişiye mesaj gönderemezsin");
            }
            MemberState ownerState = profile.privacy().messages() == InteractionPolicy.APPROVAL
                    ? MemberState.REQUEST : MemberState.ACTIVE;
            existing = chats.create(me, ownerId, ownerState);
        }
        MessageView message = send(principal, existing.id(), new SendRequest(null, MessageKind.TEXT, body, null, null), sender);
        return new Started(existing.id(), message);
    }

    @Transactional
    public MessageView send(FolyoPrincipal principal, UUID conversationId, SendRequest request) {
        User sender = users.lockById(principal.userId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return send(principal, conversationId, request, sender);
    }

    private MessageView send(FolyoPrincipal principal, UUID conversationId, SendRequest request, User sender) {
        UUID me = principal.userId();
        if (request.clientId() != null) {
            if (request.clientId().length() > 64) {
                throw bad("Geçersiz istemci kimliği");
            }
            // Ag kopup istemci tekrar gonderirse ayni mesaj ikinci kez kaydedilmez.
            var duplicate = chats.byClientId(me, request.clientId());
            if (duplicate.isPresent()) {
                return view(duplicate.get(), me, assetsOf(List.of(duplicate.get())));
            }
        }
        ChatRepository.Conversation conversation = member(conversationId, me);
        UUID otherId = conversation.other(me);
        Map<UUID, ChatRepository.Member> members = chats.members(conversationId).stream()
                .collect(Collectors.toMap(ChatRepository.Member::userId, Function.identity()));
        ChatRepository.Member mine = members.get(me);
        ChatRepository.Member other = members.get(otherId);
        if (blocks.isBlocked(otherId, me)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu kişiye mesaj gönderemezsin");
        }
        if (blocks.isBlocked(me, otherId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu kişiyi engelledin; yazmak için engeli kaldır");
        }
        boolean startedByMe = conversation.startedBy().equals(me);
        if (startedByMe && !viewers.status(me).verified()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Mesaj göndermek için önce hesabını doğrula");
        }
        if (startedByMe && other.state() == MemberState.REQUEST
                && chats.countBySenderSince(conversationId, me, 0) >= MAX_UNANSWERED_REQUEST) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Karşı taraf isteğini kabul edene kadar daha fazla mesaj gönderemezsin");
        }

        MessageKind kind = request.kind() == null ? MessageKind.TEXT : request.kind();
        String body = request.body() == null ? null : request.body().strip();
        if (body != null && body.isEmpty()) {
            body = null;
        }
        UUID assetId = null;
        String sticker = null;
        switch (kind) {
            case TEXT -> {
                if (body == null) {
                    throw bad("Boş mesaj gönderilemez");
                }
                if (body.length() > MAX_BODY) {
                    throw bad("Mesaj en fazla " + MAX_BODY + " karakter olabilir");
                }
            }
            case PHOTO, VIDEO -> {
                if (request.assetId() == null) {
                    throw bad("Önce dosyayı yükle");
                }
                if (body != null && body.length() > MAX_CAPTION) {
                    throw bad("Açıklama en fazla " + MAX_CAPTION + " karakter olabilir");
                }
                Asset asset = assets.attach(me, List.of(request.assetId())).getFirst();
                if (asset.kind() != (kind == MessageKind.PHOTO ? AssetKind.PHOTO : AssetKind.VIDEO)) {
                    throw bad("Dosya türü mesaj türüyle uyuşmuyor");
                }
                assetId = asset.id();
            }
            case STICKER -> {
                body = null;
                if (request.sticker() != null) {
                    if (!stickers.exists(request.sticker())) {
                        throw bad("Sticker bulunamadı");
                    }
                    sticker = request.sticker();
                } else if (request.assetId() != null) {
                    // Kendi sticker'larindan biri.
                    Asset asset = assetRepository.find(request.assetId())
                            .filter(a -> a.kind() == AssetKind.STICKER && a.ownerId().equals(me))
                            .orElseThrow(() -> bad("Sticker bulunamadı"));
                    assetId = asset.id();
                } else {
                    throw bad("Bir sticker seç");
                }
            }
        }

        long seq = chats.nextSeq(conversationId);
        ChatRepository.MessageRow row = chats.insert(conversationId, seq, me, kind, body, assetId, sticker, request.clientId());
        chats.markRead(conversationId, me, seq);
        // Yanit veren alici istegi kabul etmis olur; arsivdeki sohbet yeni mesajla geri gelir.
        if (mine.state() != MemberState.ACTIVE) {
            chats.setState(conversationId, me, MemberState.ACTIVE);
        }
        if (other.state() == MemberState.ARCHIVED) {
            chats.setState(conversationId, otherId, MemberState.ACTIVE);
        }
        MessageView view = view(row, me, assetsOf(List.of(row)));
        boolean pendingRequest = other.state() == MemberState.REQUEST;
        String preview = preview(row);
        afterCommit(() -> deliver(conversationId, me, otherId, row, sender.getName(), preview, pendingRequest));
        return view;
    }

    /** Commit sonrasi: alicinin acik baglantilarina iletilir; ulasirsa cift tik, ulasmazsa telefona bildirim. */
    private void deliver(UUID conversationId, UUID senderId, UUID recipientId, ChatRepository.MessageRow row,
            String senderName, String preview, boolean request) {
        Map<UUID, AssetView> media = assetsOf(List.of(row));
        hub.send(senderId, Map.of("type", "message", "conversationId", conversationId, "message", view(row, senderId, media)));
        int reached = hub.send(recipientId, Map.of("type", "message", "conversationId", conversationId,
                "message", view(row, recipientId, media)));
        if (reached > 0) {
            if (chats.markDelivered(conversationId, recipientId, row.seq())) {
                sendReceipt(conversationId, recipientId);
            }
        } else {
            enqueuePush(recipientId, senderName, conversationId, row.id(), preview, request);
        }
    }

    private void enqueuePush(UUID recipientId, String senderName, UUID conversationId, long messageId, String preview, boolean request) {
        notifications.enqueueChatMessage(recipientId, senderName, conversationId, messageId, preview, request);
    }

    // --- okuma ---

    @Transactional
    public List<ConversationView> list(FolyoPrincipal principal, String folder) {
        UUID me = principal.userId();
        List<String> states = switch (folder == null ? "CHATS" : folder) {
            case "REQUESTS" -> List.of(MemberState.REQUEST.name());
            case "ARCHIVE" -> List.of(MemberState.ARCHIVED.name());
            default -> List.of(MemberState.ACTIVE.name());
        };
        List<ChatRepository.ListRow> rows = chats.list(me, states);
        ChatRepository.PresenceSettings mySettings = chats.presenceSettings(me);
        // Liste acildiysa bu cihaz mesajlari aldi: karsi tarafa cift tik.
        for (ChatRepository.ListRow row : rows) {
            if (row.last() != null && chats.markDelivered(row.id(), me, row.last().seq())) {
                UUID conversationId = row.id();
                afterCommit(() -> sendReceipt(conversationId, me));
            }
        }
        List<ChatRepository.MessageRow> lasts = rows.stream().map(ChatRepository.ListRow::last)
                .filter(java.util.Objects::nonNull).toList();
        Map<UUID, AssetView> media = assetsOf(lasts);
        List<ConversationView> result = new ArrayList<>();
        for (ChatRepository.ListRow row : rows) {
            result.add(new ConversationView(row.id(),
                    new Person(row.otherId(), row.otherName(), row.otherUsername(), row.otherAvatarUrl()),
                    row.myState(), row.unread(), row.last() == null ? null : view(row.last(), me, media),
                    row.lastMessageAt(), row.otherDeliveredSeq(),
                    mySettings.readReceipts() && row.otherReadReceipts() ? row.otherReadSeq() : null,
                    presence(me, mySettings, row.otherId(), row.otherLastSeenAudience(), row.otherLastSeenAt()),
                    row.startedBy().equals(me)));
        }
        return result;
    }

    @Transactional
    public Thread thread(FolyoPrincipal principal, UUID conversationId, Long before) {
        UUID me = principal.userId();
        ChatRepository.Conversation conversation = member(conversationId, me);
        List<ChatRepository.MessageRow> rows = chats.messages(conversationId, before, PAGE + 1);
        Long next = null;
        if (rows.size() > PAGE) {
            rows = rows.subList(0, PAGE);
            next = rows.getLast().seq();
        }
        if (before == null && chats.markDelivered(conversationId, me, conversation.lastSeq())) {
            afterCommit(() -> sendReceipt(conversationId, me));
        }
        Map<UUID, AssetView> media = assetsOf(rows);
        List<MessageView> messages = new ArrayList<>(rows.stream().map(r -> view(r, me, media)).toList());
        java.util.Collections.reverse(messages);
        return new Thread(conversationView(conversationId, me), messages, next);
    }

    /** Okundu: ileriye dogru tasinir; iki taraf da okundu bilgisini aciksa karsi tarafa mavi tik gider. */
    @Transactional
    public void markRead(UUID me, UUID conversationId, long seq) {
        member(conversationId, me);
        if (chats.markRead(conversationId, me, seq)) {
            afterCommit(() -> sendReceipt(conversationId, me));
        }
    }

    @Transactional
    public void setState(FolyoPrincipal principal, UUID conversationId, MemberState state) {
        member(conversationId, principal.userId());
        if (state == null || state == MemberState.REQUEST) {
            throw bad("Geçersiz durum");
        }
        chats.setState(conversationId, principal.userId(), state);
    }

    /** Herkesten sil: yalniz gonderen, 48 saat icinde. Yerine "Bu mesaj silindi" kalir. */
    @Transactional
    public void deleteMessage(FolyoPrincipal principal, UUID conversationId, long messageId) {
        UUID me = principal.userId();
        ChatRepository.Conversation conversation = member(conversationId, me);
        ChatRepository.MessageRow row = chats.message(conversationId, messageId)
                .filter(r -> r.senderId().equals(me) && !r.deleted())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Mesaj bulunamadı"));
        if (row.createdAt().isBefore(Instant.now().minus(DELETE_WINDOW))) {
            throw bad("Mesajlar yalnız 48 saat içinde herkesten silinebilir");
        }
        chats.softDelete(messageId);
        if (row.assetId() != null && row.kind() != MessageKind.STICKER) {
            assets.deleteWithFiles(assetRepository.findAll(List.of(row.assetId())));
        }
        UUID other = conversation.other(me);
        Map<String, Object> event = Map.of("type", "deleted", "conversationId", conversationId, "messageId", messageId);
        afterCommit(() -> {
            hub.send(me, event);
            hub.send(other, event);
        });
    }

    @Transactional
    public void block(FolyoPrincipal principal, UUID conversationId) {
        UUID me = principal.userId();
        ChatRepository.Conversation conversation = member(conversationId, me);
        blocks.block(me, conversation.other(me));
        chats.setState(conversationId, me, MemberState.ARCHIVED);
    }

    @Transactional(readOnly = true)
    public Unread unread(UUID me) {
        long[] counts = chats.unread(me);
        return new Unread(counts[0], counts[1]);
    }

    @Transactional(readOnly = true)
    public Settings settings(UUID me) {
        ChatRepository.PresenceSettings s = chats.presenceSettings(me);
        return new Settings(LastSeenAudience.valueOf(s.lastSeenAudience()), s.readReceipts());
    }

    @Transactional
    public Settings saveSettings(UUID me, Settings settings) {
        if (settings.lastSeenAudience() == null) {
            throw bad("Son görülme seçimini yap");
        }
        chats.savePresenceSettings(me, settings.lastSeenAudience().name(), settings.readReceipts());
        afterCommit(() -> broadcastPresence(me, hub.isOnline(me)));
        return settings;
    }

    /** Medya okunurken: sohbetin uyesi mi. */
    @Transactional(readOnly = true)
    public boolean isMember(UUID conversationId, UUID userId) {
        return userId != null && chats.find(conversationId).map(c -> c.has(userId)).orElse(false);
    }

    // --- anlik olaylar (WebSocket) ---

    /** Yaziyor: kaydedilmez, yalniz karsi tarafin acik baglantilarina iletilir. */
    @Transactional(readOnly = true)
    public void typing(UUID me, UUID conversationId) {
        ChatRepository.Conversation conversation = chats.find(conversationId).filter(c -> c.has(me)).orElse(null);
        if (conversation == null) {
            return;
        }
        UUID other = conversation.other(me);
        if (!blocks.isBlocked(other, me) && !blocks.isBlocked(me, other)) {
            hub.send(other, Map.of("type", "typing", "conversationId", conversationId, "userId", me));
        }
    }

    @Transactional
    public void onConnected(UUID me, boolean first) {
        if (first) {
            broadcastPresence(me, true);
        }
    }

    @Transactional
    public void onDisconnected(UUID me, boolean last) {
        if (last) {
            chats.touchLastSeen(me);
            broadcastPresence(me, false);
        }
    }

    /** Durum degisikligi, kisinin gizlilik secimine gore gorebilecek sohbet ortaklarina gonderilir. */
    private void broadcastPresence(UUID me, boolean online) {
        ChatRepository.PresenceSettings mine = chats.presenceSettings(me);
        for (UUID partner : chats.partners(me)) {
            if (!hub.isOnline(partner)) {
                continue;
            }
            ChatRepository.PresenceSettings theirs = chats.presenceSettings(partner);
            Presence presence = presence(partner, theirs, me, mine.lastSeenAudience(), online ? null : mine.lastSeenAt());
            Map<String, Object> event = new java.util.HashMap<>();
            event.put("type", "presence");
            event.put("userId", me);
            event.put("online", presence != null && presence.online());
            event.put("lastSeenAt", presence == null ? null : presence.lastSeenAt());
            event.put("hidden", presence == null);
            hub.send(partner, event);
        }
    }

    /**
     * Karsi tarafin cevrimici/son gorulme bilgisi bakan kisiye gosterilir mi. WhatsApp kurali: kendi son gorulmesini
     * kimseye gostermeyen, baskasininkini de goremez.
     */
    private Presence presence(UUID viewerId, ChatRepository.PresenceSettings viewerSettings, UUID targetId,
            String targetAudience, Instant targetLastSeen) {
        if (LastSeenAudience.NOBODY.name().equals(viewerSettings.lastSeenAudience())) {
            return null;
        }
        boolean allowed = switch (LastSeenAudience.valueOf(targetAudience)) {
            case EVERYONE -> true;
            case CHATS -> chats.partners(viewerId, targetId);
            case NOBODY -> false;
        };
        if (!allowed) {
            return null;
        }
        boolean online = hub.isOnline(targetId);
        return new Presence(online, online ? null : targetLastSeen);
    }

    private void sendReceipt(UUID conversationId, UUID readerId) {
        ChatRepository.Conversation conversation = chats.find(conversationId).orElse(null);
        if (conversation == null) {
            return;
        }
        UUID other = conversation.other(readerId);
        ChatRepository.Member reader = chats.members(conversationId).stream()
                .filter(m -> m.userId().equals(readerId)).findFirst().orElse(null);
        if (reader == null) {
            return;
        }
        boolean share = chats.presenceSettings(readerId).readReceipts() && chats.presenceSettings(other).readReceipts();
        Map<String, Object> event = new java.util.HashMap<>();
        event.put("type", "receipt");
        event.put("conversationId", conversationId);
        event.put("userId", readerId);
        event.put("deliveredSeq", reader.deliveredSeq());
        event.put("readSeq", share ? reader.readSeq() : null);
        hub.send(other, event);
    }

    private ConversationView conversationView(UUID conversationId, UUID me) {
        return list(me, conversationId);
    }

    private ConversationView list(UUID me, UUID conversationId) {
        return chats.list(me, List.of("ACTIVE", "REQUEST", "ARCHIVED")).stream().filter(r -> r.id().equals(conversationId))
                .findFirst()
                .map(row -> {
                    ChatRepository.PresenceSettings mySettings = chats.presenceSettings(me);
                    Map<UUID, AssetView> media = assetsOf(row.last() == null ? List.of() : List.of(row.last()));
                    return new ConversationView(row.id(),
                            new Person(row.otherId(), row.otherName(), row.otherUsername(), row.otherAvatarUrl()),
                            row.myState(), row.unread(), row.last() == null ? null : view(row.last(), me, media),
                            row.lastMessageAt(), row.otherDeliveredSeq(),
                            mySettings.readReceipts() && row.otherReadReceipts() ? row.otherReadSeq() : null,
                            presence(me, mySettings, row.otherId(), row.otherLastSeenAudience(), row.otherLastSeenAt()),
                            row.startedBy().equals(me));
                })
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sohbet bulunamadı"));
    }

    private ChatRepository.Conversation member(UUID conversationId, UUID me) {
        return chats.find(conversationId).filter(c -> c.has(me))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sohbet bulunamadı"));
    }

    private Map<UUID, AssetView> assetsOf(List<ChatRepository.MessageRow> rows) {
        List<UUID> ids = rows.stream().map(ChatRepository.MessageRow::assetId).filter(java.util.Objects::nonNull).toList();
        return assetRepository.findAll(ids).stream().collect(Collectors.toMap(Asset::id, AssetView::from));
    }

    private MessageView view(ChatRepository.MessageRow r, UUID me, Map<UUID, AssetView> media) {
        String stickerUrl = r.sticker() != null ? StickerCatalog.url(r.sticker())
                : (r.kind() == MessageKind.STICKER && r.assetId() != null ? AssetView.url(r.assetId(), "sticker") : null);
        return new MessageView(r.id(), r.seq(), r.senderId(), r.senderId().equals(me), r.kind(),
                r.deleted() ? null : r.body(), r.sticker(), r.deleted() ? null : stickerUrl,
                r.deleted() || r.kind() == MessageKind.STICKER ? null : media.get(r.assetId()), r.createdAt(), r.deleted());
    }

    private static String preview(ChatRepository.MessageRow row) {
        return switch (row.kind()) {
            case TEXT -> row.body();
            case PHOTO -> row.body() == null ? "📷 Fotoğraf" : "📷 " + row.body();
            case VIDEO -> row.body() == null ? "🎥 Video" : "🎥 " + row.body();
            case STICKER -> "Sticker";
        };
    }

    private void afterCommit(Runnable action) {
        Runnable safe = () -> {
            try {
                afterCommitTx.executeWithoutResult(status -> action.run());
            } catch (RuntimeException e) {
                // Mesaj kaydedildi; anlik iletim/tik basarisiz olsa da istemci bir sonraki okumada gorur.
                org.slf4j.LoggerFactory.getLogger(ChatService.class).warn("Sohbet olayi iletilemedi", e);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    safe.run();
                }
            });
        } else {
            safe.run();
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
