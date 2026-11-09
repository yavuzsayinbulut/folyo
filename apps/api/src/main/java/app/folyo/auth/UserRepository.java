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
            insert into users (id, auth_provider, auth_subject, email, name, avatar_url, provider_avatar_url, email_verified_at)
            values (:id, :provider, :subject, :email, :name, :avatarUrl, :avatarUrl, case when :emailVerified then now() end)
            on conflict (auth_provider, auth_subject)
            do update set name = excluded.name,
                provider_avatar_url = excluded.provider_avatar_url,
                avatar_url = case when users.avatar_asset_id is not null or users.auto_avatar_asset_id is not null
                    then users.avatar_url else excluded.provider_avatar_url end,
                email = case when users.email_verified_at is not null then users.email
                    else coalesce(excluded.email, users.email) end,
                email_verified_at = case
                    when users.email_verified_at is not null then users.email_verified_at
                    when excluded.email is null then null
                    else excluded.email_verified_at end
            """)
    void upsert(UUID id, String provider, String subject, String email, boolean emailVerified, String name,
            String avatarUrl);

    /**
     * Yuklenen profil fotografi (null: kaldirildi). Gorunen adres avatar_url'ye yazilir, boylece adin gorundugu her yerde
     * ayni fotograf cikar: yuklenen > otomatik > giris hesabinin fotografi.
     */
    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true, value = """
            update users set avatar_asset_id = :assetId, avatar_url = case
                when cast(:assetId as uuid) is not null then '/api/public/assets/' || cast(:assetId as uuid) || '/avatar'
                when auto_avatar_asset_id is not null then '/api/public/assets/' || auto_avatar_asset_id || '/avatar'
                else provider_avatar_url end
            where id = :id""")
    void setUploadedAvatar(UUID id, UUID assetId);

    /** Otomatik gorsel (null: yok). Yuklenen fotograf varsa gorunen adres degismez. */
    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true, value = """
            update users set auto_avatar_asset_id = :assetId, auto_avatar_source = :source, auto_avatar_key = :key,
                auto_avatar_retry_at = :retryAt,
                avatar_url = case
                    when avatar_asset_id is not null then avatar_url
                    when cast(:assetId as uuid) is not null then '/api/public/assets/' || cast(:assetId as uuid) || '/avatar'
                    else provider_avatar_url end
            where id = :id""")
    void setAutoAvatar(UUID id, UUID assetId, String source, String key, java.time.Instant retryAt);

    /** Gorsel degismeden girdiler/yeniden deneme zamani guncellenir. */
    @Modifying(clearAutomatically = true)
    @Query(nativeQuery = true, value = "update users set auto_avatar_key = :key, auto_avatar_retry_at = :retryAt where id = :id")
    void markAutoAvatar(UUID id, String key, java.time.Instant retryAt);

    /** Otomatik gorseli hic hesaplanmamis, eski surumle hesaplanmis ya da yeniden deneme zamani gelmis kullanicilar. */
    @Query(nativeQuery = true, value = """
            select u.id from users u
            where (u.auto_avatar_key is null or u.auto_avatar_key not like :currentKeys or u.auto_avatar_retry_at < now())
              and exists (select 1 from profiles p where p.user_id = u.id)
            order by u.auto_avatar_retry_at nulls first
            limit :limit""")
    java.util.List<UUID> autoAvatarPending(String currentKeys, int limit);

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
