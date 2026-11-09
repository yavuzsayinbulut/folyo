# folyo — prod kurulumu

Tek sunucu, Docker Compose. Dışarıya yalnız Caddy açılır (80/443, otomatik HTTPS); API, web ve Postgres iç ağda kalır.

```
İnternet ──> Caddy :443 ──┬─ /api/*, /oauth2/*, /login/oauth2/*  ──> api:8080 (Spring Boot)
                          └─ diğer her şey                        ──> web:3000 (Next.js)
                                api ──> db:5432 (Postgres 18), media volume (fotoğraf/video) ya da S3 uyumlu depo
```

`/api/realtime` (anlık sohbet WebSocket'i) da Caddy üzerinden API'ye gider. Video yüklemesi 200 MB'a kadar kabul edilir
(`Caddyfile` yalnız bu yol için büyük gövdeye izin verir). Fotoğraf/video deposu yönetim panelinden seçilir; S3 kovası
herkese kapalı kalmalıdır, dosyalar API üzerinden izin kontrolüyle sunulur.

## 1. Bir kez yapılacaklar

1. **Sunucu**: 2 vCPU / 4 GB RAM yeterli. Docker ve Compose eklentisi kurulu olmalı. Güvenlik duvarında yalnız 22, 80, 443 açık.
2. **DNS**: `folyo.app` (ya da kendi alan adın) için A/AAAA kaydı sunucuya. Caddy sertifikayı ilk istekte alır.
3. **OAuth uygulamaları** (en az biri; prod'da geliştirici girişi yoktur):
   - Google Cloud Console → OAuth istemcisi → yönlendirme adresi `https://<alan-adı>/login/oauth2/code/google`
   - GitHub → Settings → Developer settings → OAuth App → callback `https://<alan-adı>/login/oauth2/code/github`
   - İsteğe bağlı: Spotify (`/api/me/connections/spotify/callback`), Strava (yetkili alan adı `<alan-adı>`).
4. **Gizli değerler**: sunucuda bu klasörü kopyala, `.env.example` → `.env`, doldur:
   ```bash
   cp .env.example .env
   openssl rand -base64 32   # DB_PASSWORD için
   openssl rand -base64 32   # FOLYO_TOKEN_KEY için (bir kez üret, asla değiştirme)
   chmod 600 .env
   ```
   `FOLYO_TOKEN_KEY` değişirse kayıtlı Spotify/Strava bağlantıları çözülemez; anahtarı parola yöneticisinde de sakla.
5. **Yönetici**: `.env` içinde `FOLYO_ADMIN_EMAILS` (virgülle) tanımla. Bu e-postayla giriş yapıp e-postasını doğrulayan
   hesap `/admin` paneline girer: SMS (Twilio / Netgsm) ve e-posta (SMTP) entegrasyonlarını seçer, parolaları girer
   (sunucuda şifreli saklanır, ekrana geri gelmez), deneme gönderir ve mesaj/yorum için hangi doğrulamaların zorunlu
   olduğuna karar verir. Telefon doğrulaması zorunluyken SMS kapalıysa panel uyarır.
6. **İmajlar**: `main`'e her push'ta GitHub Actions (`.github/workflows/api.yml`, `web.yml`) imajları `ghcr.io/<hesap>/folyo-api` ve `folyo-web` olarak yayınlar.
   Repo private ise sunucuda bir kez: `docker login ghcr.io` (yalnız `read:packages` yetkili token ile).

## 2. Çalıştırma ve güncelleme

```bash
docker compose -f compose.prod.yml --env-file .env pull
docker compose -f compose.prod.yml --env-file .env up -d
docker compose -f compose.prod.yml ps        # api "healthy" olmalı
```

Belirli bir sürüme dönmek için `.env` içinde `API_IMAGE` / `WEB_IMAGE`'i git SHA etiketine çevirip aynı iki komutu çalıştır.
Veritabanı şeması API açılırken Flyway ile güncellenir; migration'lar yalnız ileri yönlüdür, geri dönüşten önce yedek al.

## 3. Yedek

`backup.sh` Postgres dökümünü ve fotoğraf klasörünü `backups/` altına alır, 14 günden eskileri siler. Günlük cron:

```cron
30 3 * * * cd /opt/folyo && ./backup.sh >> backups/backup.log 2>&1
```

Yedekleri sunucu dışına da kopyala (ör. `rclone` ile bir nesne depolamaya). Geri yükleme: `pg_restore` + media tar'ını volume'a aç.

## 4. Güvenlik notları

- API yalnız iç ağdadır; Caddy istemcinin `X-Forwarded-For` başlığını yok sayıp gerçek IP'yi yazar. Hız sınırı ve tekil ziyaretçi sayımı bu IP'ye dayanır. **api:8080'i asla dışarı açma.**
- Oturumlar Postgres'te (Spring Session) tutulur: deploy/yeniden başlatma kullanıcıları çıkış yaptırmaz. Oturum çerezi `Secure`, `HttpOnly`, `SameSite=Lax`.
- `/actuator/health` yalnız iç ağdan (compose healthcheck) okunur; Caddy dışarı yönlendirmez.
- Loglar JSON'dur: `docker compose logs -f api`.

## 5. Mobil uygulama (EAS)

`apps/mobile/eas.json` profilleri prod adresleri verir; yayın derlemesi `https` olmayan adresle açılmaz.

```bash
cd ../apps/mobile
eas build --profile production --platform android
eas build --profile production --platform ios   # Xcode/macOS sürümünden bağımsız, EAS bulutta derler
```

Mağaza gereksinimleri: uygulama içi hesap silme (Profil → Hesabımı sil) ve gizlilik sayfası (`https://<alan-adı>/gizlilik`) hazır.
