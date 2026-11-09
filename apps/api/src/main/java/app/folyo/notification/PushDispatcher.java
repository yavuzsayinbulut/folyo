package app.folyo.notification;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Kuyruktaki bildirimleri Expo Push'a iletir.
 * - Kayitlar kisa bir transaction'da kiralanir; Expo cagrisi transaction disinda yapilir, sonuc kayit basina ayri
 *   transaction'da yazilir. Boylece bir kaydin hatasi digerlerini geri almaz ve gonderilmisler tekrar gitmez.
 * - Teslim "en az bir kez"dir: Expo kabul edip sonuc yazilamazsa kira dolunca bildirim tekrar gidebilir; kaybolmaz.
 * - Gecici hatada ustel bekleme ile 5 kez denenir, sonra "basarisiz" isaretlenir.
 * - Gecersizlesmis cihazlar (DeviceNotRegistered) hem bilette hem sonradan gelen makbuzda silinir.
 */
@Service
public class PushDispatcher {

    private static final Logger log = LoggerFactory.getLogger(PushDispatcher.class);
    static final int BATCH = 50;
    static final int MAX_ATTEMPTS = 5;
    private static final Duration RECEIPT_DELAY = Duration.ofMinutes(15);
    /** Bir turda gonderim bu sureyi asarsa kayit baska bir tura birakilir. */
    static final Duration LEASE = Duration.ofMinutes(2);

    private final NotificationRepository repository;
    private final ExpoPushClient expo;
    private final TransactionTemplate transaction;
    private final JsonMapper json = JsonMapper.builder().build();

    public PushDispatcher(NotificationRepository repository, ExpoPushClient expo, TransactionTemplate transaction) {
        this.repository = repository;
        this.expo = expo;
        this.transaction = transaction;
    }

    @Scheduled(fixedDelayString = "${folyo.push.dispatch-interval:PT10S}",
            initialDelayString = "${folyo.push.dispatch-initial-delay:PT20S}")
    public void dispatchScheduled() {
        try {
            dispatchDue();
        } catch (RuntimeException e) {
            log.warn("Bildirim gonderimi basarisiz", e);
        }
    }

    /** @return bu turda islenen kuyruk kaydi sayisi */
    public int dispatchDue() {
        List<NotificationRepository.OutboxItem> due = transaction.execute(status -> repository.claimDue(BATCH, LEASE));
        if (due == null) {
            return 0;
        }
        for (NotificationRepository.OutboxItem item : due) {
            try {
                deliver(item);
            } catch (RuntimeException e) {
                // Beklenmeyen hata yalniz bu kaydi etkiler; deneme sayilir, sinir dolunca birakilir (sonsuz tekrar yok).
                log.warn("Bildirim gonderilemedi: {}", item.id(), e);
                try {
                    transaction.executeWithoutResult(status -> {
                        if (item.attempts() + 1 >= MAX_ATTEMPTS) {
                            repository.markFailed(item.id(), String.valueOf(e.getMessage()));
                        } else {
                            repository.markRetry(item.id(), Instant.now().plus(Duration.ofMinutes(1L << item.attempts())),
                                    String.valueOf(e.getMessage()));
                        }
                    });
                } catch (RuntimeException ignored) {
                    // Veritabani da yanit vermiyorsa kira dolunca kayit yeniden alinir.
                }
            }
        }
        return due.size();
    }

    private void deliver(NotificationRepository.OutboxItem item) {
        List<NotificationRepository.Device> devices = repository.devicesOf(item.userId());
        if (devices.isEmpty()) {
            // Kullanici cihazini kaldirmis; gonderilecek yer yok.
            transaction.executeWithoutResult(status -> repository.markSent(item.id()));
            return;
        }
        Map<String, Object> data = parse(item.data());
        List<ExpoPushClient.Message> messages = new ArrayList<>();
        for (NotificationRepository.Device device : devices) {
            messages.add(new ExpoPushClient.Message(device.expoToken(), item.title(), item.body(), data));
        }
        List<ExpoPushClient.Ticket> tickets;
        try {
            tickets = expo.send(messages);
        } catch (ExpoPushClient.PushUnavailableException e) {
            transaction.executeWithoutResult(status -> {
                if (item.attempts() + 1 >= MAX_ATTEMPTS) {
                    repository.markFailed(item.id(), e.getMessage());
                } else {
                    Duration backoff = Duration.ofMinutes(1L << item.attempts());
                    repository.markRetry(item.id(), Instant.now().plus(backoff), e.getMessage());
                }
            });
            return;
        }
        transaction.executeWithoutResult(status -> {
            for (int i = 0; i < tickets.size(); i++) {
                ExpoPushClient.Ticket ticket = tickets.get(i);
                NotificationRepository.Device device = devices.get(i);
                if (ticket.ticketId() != null) {
                    repository.saveReceipt(ticket.ticketId(), device.id());
                } else if (ticket.deviceNotRegistered()) {
                    repository.deleteDevice(device.id());
                }
            }
            repository.markSent(item.id());
        });
    }

    /** Expo, bildirimin cihaza ulasip ulasmadigini ~15 dk sonra makbuzla bildirir. */
    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "${folyo.push.receipts-initial-delay:PT5M}")
    public void checkReceipts() {
        List<NotificationRepository.PendingReceipt> pending = repository.receiptsOlderThan(Instant.now().minus(RECEIPT_DELAY), 1000);
        if (pending.isEmpty()) {
            return;
        }
        Map<String, String> results;
        try {
            results = expo.receipts(pending.stream().map(NotificationRepository.PendingReceipt::ticketId).toList());
        } catch (ExpoPushClient.PushUnavailableException e) {
            log.info("Bildirim makbuzlari alinamadi, sonra denenecek: {}", e.getMessage());
            return;
        }
        List<String> done = new ArrayList<>();
        for (NotificationRepository.PendingReceipt receipt : pending) {
            String ticketId = receipt.ticketId();
            if (results.containsKey(ticketId)) {
                if ("DeviceNotRegistered".equals(results.get(ticketId))) {
                    repository.deleteDevice(receipt.deviceId());
                }
                done.add(ticketId);
            }
        }
        repository.deleteReceipts(done);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String data) {
        try {
            return json.readValue(data, Map.class);
        } catch (RuntimeException e) {
            return Map.of();
        }
    }
}
