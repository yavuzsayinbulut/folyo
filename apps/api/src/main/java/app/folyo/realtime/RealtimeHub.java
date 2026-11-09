package app.folyo.realtime;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import tools.jackson.databind.json.JsonMapper;

/**
 * Acik WebSocket baglantilari (kullanici basina birden cok cihaz/sekme). Tek sunucu varsayilir; birden fazla
 * API kopyasi calistirilacaksa olaylar ortak bir araci (Redis vb.) uzerinden dagitilmalidir.
 */
@Component
public class RealtimeHub {

    private static final Logger log = LoggerFactory.getLogger(RealtimeHub.class);
    /** Istemci 25 sn'de bir "ping" atar; bu sure boyunca ses gelmeyen baglanti kopmus sayilir. */
    static final Duration IDLE = Duration.ofSeconds(75);

    private final Map<UUID, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();
    private final Map<String, Instant> lastActivity = new ConcurrentHashMap<>();
    private final JsonMapper json = JsonMapper.builder().build();

    /** @return kullanicinin ilk baglantisi mi (cevrimici oldu) */
    boolean register(UUID userId, WebSocketSession raw) {
        WebSocketSession session = new ConcurrentWebSocketSessionDecorator(raw, 5_000, 512 * 1024);
        raw.getAttributes().put("decorated", session);
        touch(raw);
        Set<WebSocketSession> set = sessions.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet());
        set.add(session);
        return set.size() == 1;
    }

    /** @return kullanicinin son baglantisi miydi (cevrimdisi oldu) */
    boolean unregister(UUID userId, WebSocketSession raw) {
        lastActivity.remove(raw.getId());
        Object decorated = raw.getAttributes().get("decorated");
        Set<WebSocketSession> set = sessions.get(userId);
        if (set == null) {
            return false;
        }
        set.remove(decorated);
        if (set.isEmpty()) {
            sessions.remove(userId, set);
            return true;
        }
        return false;
    }

    void touch(WebSocketSession raw) {
        lastActivity.put(raw.getId(), Instant.now());
    }

    public boolean isOnline(UUID userId) {
        Set<WebSocketSession> set = sessions.get(userId);
        return set != null && !set.isEmpty();
    }

    /** Olayi kullanicinin tum acik baglantilarina gonderir. @return ulastigi baglanti sayisi */
    public int send(UUID userId, Object event) {
        Set<WebSocketSession> set = sessions.get(userId);
        if (set == null || set.isEmpty()) {
            return 0;
        }
        TextMessage message = new TextMessage(json.writeValueAsString(event));
        int delivered = 0;
        for (WebSocketSession session : set) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(message);
                    delivered++;
                }
            } catch (IOException | RuntimeException e) {
                log.debug("Anlik olay gonderilemedi: {}", e.getMessage());
            }
        }
        return delivered;
    }

    /** Olayi yalniz bu baglantiya gonderir ("ready", "pong": diger cihazlari ilgilendirmez). */
    void reply(WebSocketSession raw, Object event) {
        Object decorated = raw.getAttributes().get("decorated");
        WebSocketSession session = decorated instanceof WebSocketSession s ? s : raw;
        try {
            if (session.isOpen()) {
                session.sendMessage(new TextMessage(json.writeValueAsString(event)));
            }
        } catch (IOException | RuntimeException e) {
            log.debug("Anlik olay gonderilemedi: {}", e.getMessage());
        }
    }

    /** Sessiz kalan (uygulama arka planda kapanmis, ag kopmus) baglantilar kapatilir; durum dogru kalir. */
    @Scheduled(fixedDelay = 30_000)
    void closeIdle() {
        Instant limit = Instant.now().minus(IDLE);
        for (Set<WebSocketSession> set : sessions.values()) {
            for (WebSocketSession session : set) {
                Object raw = session instanceof ConcurrentWebSocketSessionDecorator d ? d.getDelegate() : session;
                String id = ((WebSocketSession) raw).getId();
                Instant last = lastActivity.get(id);
                if (last != null && last.isBefore(limit)) {
                    try {
                        session.close(CloseStatus.SESSION_NOT_RELIABLE);
                    } catch (IOException e) {
                        log.debug("Baglanti kapatilamadi: {}", e.getMessage());
                    }
                }
            }
        }
    }
}
