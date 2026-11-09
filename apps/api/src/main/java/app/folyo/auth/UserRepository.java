package app.folyo.auth;

import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByAuthProviderAndAuthSubject(String authProvider, String authSubject);

    /** Ayni kullanicinin es zamanli islemlerini sirayla calistirmak icin satiri kilitler (transaction sonuna kadar). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> lockById(UUID id);

    /**
     * Ayni kimlikle es zamanli ilk giriste iki satir olusmasin diye insert ve guncelleme tek ifadede yapilir.
     * Dogrulanmis bir e-posta (saglayicidan ya da kodla) girislerde degistirilmez: kodla dogrulanan adres bir sonraki
     * Google girisinde ezilip yoneticilik gibi haklar kaybolmaz. Dogrulanmis e-posta yoksa saglayicinin verdigi alinir.
     */
    @Modifying
    @Query(nativeQuery = true, value = """
            insert into users (id, auth_provider, auth_subject, email, name, avatar_url, email_verified_at)
            values (:id, :provider, :subject, :email, :name, :avatarUrl, case when :emailVerified then now() end)
            on conflict (auth_provider, auth_subject)
            do update set name = excluded.name,
                avatar_url = case when users.avatar_asset_id is not null then users.avatar_url else excluded.avatar_url end,
                email = case when users.email_verified_at is not null then users.email
                    else coalesce(excluded.email, users.email) end,
                email_verified_at = case
                    when users.email_verified_at is not null then users.email_verified_at
                    when excluded.email is null then null
                    else excluded.email_verified_at end
            """)
    void upsert(UUID id, String provider, String subject, String email, boolean emailVerified, String name,
            String avatarUrl);

    /** Ozel profil fotografi: adres avatar_url'ye yazilir, boylece adin gorundugu her yerde ayni fotograf cikar. */
    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true, value = "update users set avatar_asset_id = :assetId, avatar_url = :url where id = :id")
    void setAvatar(UUID id, UUID assetId, String url);

    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true, value = "update users set role = :role where id = :id")
    void setRole(UUID id, String role);

    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true, value = "update users set email = :email, email_verified_at = now() where id = :id")
    void markEmailVerified(UUID id, String email);

    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true, value = "update users set phone = :phone, phone_verified_at = now() where id = :id")
    void markPhoneVerified(UUID id, String phone);

    @Query(nativeQuery = true, value = """
            select exists(select 1 from users where phone = :phone and phone_verified_at is not null and id <> :id)""")
    boolean phoneVerifiedByAnotherUser(String phone, UUID id);
}
