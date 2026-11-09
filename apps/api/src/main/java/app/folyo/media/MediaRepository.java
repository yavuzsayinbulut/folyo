package app.folyo.media;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MediaRepository extends JpaRepository<Media, UUID> {

    List<Media> findByCardIdInOrderByPosition(Collection<UUID> cardIds);

    long countByCardId(UUID cardId);

    @Query("select coalesce(max(m.position), -1) from Media m where m.cardId = :cardId")
    int findMaxPosition(UUID cardId);

    @Query("select m from Media m where m.cardId = :cardId")
    List<Media> findByCard(UUID cardId);

    @Query("select m from Media m, Card c, Profile p where m.cardId = c.id and c.profileId = p.id and p.userId = :userId")
    List<Media> findOfUser(UUID userId);

    /** Kart/hesap silinirken depodan silinecek dosyalar (kopya ve orijinal). */
    static List<String> keys(List<Media> items) {
        List<String> keys = new java.util.ArrayList<>();
        for (Media m : items) {
            keys.add(m.getStorageKey());
            if (m.getOriginalKey() != null) {
                keys.add(m.getOriginalKey());
            }
        }
        return keys;
    }

    default List<String> findStorageKeys(UUID cardId) {
        return keys(findByCard(cardId));
    }

    default List<String> findStorageKeysOfUser(UUID userId) {
        return keys(findOfUser(userId));
    }
}
