package app.folyo.auth;

import app.folyo.media.MediaRepository;
import app.folyo.media.MediaStorage;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

/**
 * Hesabi ve ona bagli butun veriyi kalici olarak siler (KVKK / App Store hesap silme zorunlulugu).
 * Satirlar FK cascade ile gider: profil, kartlar, fotograf kayitlari, baglantilar ve token'lari, aktivite,
 * istatistikler, kullanicinin baska sayfalara biraktigi mesajlar, mobil token'lar ve bildirim cihazlari.
 * Fotograf dosyalari ve oturumlar veritabani disinda oldugu icin commit'ten sonra ayrica silinir.
 */
@Service
public class AccountService {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final UserRepository users;
    private final MediaRepository media;
    private final MediaStorage storage;
    private final ObjectProvider<FindByIndexNameSessionRepository<? extends Session>> sessions;

    public AccountService(UserRepository users, MediaRepository media, MediaStorage storage,
            ObjectProvider<FindByIndexNameSessionRepository<? extends Session>> sessions) {
        this.users = users;
        this.media = media;
        this.storage = storage;
        this.sessions = sessions;
    }

    @Transactional
    public void delete(UUID userId) {
        User user = users.lockById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Hesap bulunamadı"));
        List<String> files = media.findStorageKeysOfUser(userId);
        users.delete(user);
        users.flush();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                storage.deleteQuietly(files);
                deleteSessions(userId);
            }
        });
    }

    /** Diger tarayicilardaki oturumlar da kapanir; silinmis hesabin oturumu bos bir kimlikle kalmaz. */
    private void deleteSessions(UUID userId) {
        var repository = sessions.getIfAvailable();
        if (repository == null) {
            return;
        }
        try {
            repository.findByPrincipalName(userId.toString()).keySet().forEach(repository::deleteById);
        } catch (RuntimeException e) {
            log.warn("Silinen hesabin oturumlari kapatilamadi: {}", userId, e);
        }
    }
}
