package app.folyo.realtime;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.chat.ChatService;
import java.security.Principal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Istemciden gelen anlik olaylar: "typing" (yaziyor), "read" (okundu), "ping" (baglanti canli).
 * Mesaj gondermek HTTP ile yapilir (kaydedilir, tekrar denenebilir); bu kanal yalniz bildirim tasir.
 */
@Component
public class RealtimeHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(RealtimeHandler.class);
    /** Ayni sohbet icin "yaziyor" en fazla 2 sn'de bir iletilir. */
    private static final long TYPING_INTERVAL_MS = 2_000;

    private final RealtimeHub hub;
    private final ChatService chats;
    private final JsonMapper json = JsonMapper.builder().build();
    private final Map<String, Instant> lastTyping = new ConcurrentHashMap<>();

    public RealtimeHandler(RealtimeHub hub, ChatService chats) {
        this.hub = hub;
        this.chats = chats;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        UUID userId = userId(session);
        if (userId == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        boolean first = hub.register(userId, session);
        chats.onConnected(userId, first);
        hub.reply(session, Map.of("type", "ready"));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        UUID userId = userId(session);
        if (userId == null) {
            return;
        }
        hub.touch(session);
        JsonNode event;
        try {
            event = json.readTree(message.getPayload());
        } catch (RuntimeException e) {
            return;
        }
        String type = event.path("type").asString("");
        try {
            switch (type) {
                case "ping" -> hub.reply(session, Map.of("type", "pong"));
                case "typing" -> {
                    UUID conversationId = UUID.fromString(event.path("conversationId").asString(""));
                    String key = userId + ":" + conversationId;
                    Instant last = lastTyping.get(key);
                    Instant now = Instant.now();
                    if (last == null || now.toEpochMilli() - last.toEpochMilli() >= TYPING_INTERVAL_MS) {
                        lastTyping.put(key, now);
                        chats.typing(userId, conversationId);
                    }
                }
                case "read" -> chats.markRead(userId, UUID.fromString(event.path("conversationId").asString("")),
                        event.path("seq").asLong(0));
                default -> {
                }
            }
        } catch (IllegalArgumentException e) {
            // Bozuk olay yok sayilir.
        } catch (RuntimeException e) {
            log.debug("Anlik olay islenemedi: {} {}", type, e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        UUID userId = userId(session);
        if (userId == null) {
            return;
        }
        boolean last = hub.unregister(userId, session);
        if (last) {
            lastTyping.keySet().removeIf(k -> k.startsWith(userId + ":"));
        }
        chats.onDisconnected(userId, last);
    }

    private static UUID userId(WebSocketSession session) {
        Principal principal = session.getPrincipal();
        if (principal instanceof Authentication auth && auth.getPrincipal() instanceof FolyoPrincipal folyo) {
            return folyo.userId();
        }
        return null;
    }
}
