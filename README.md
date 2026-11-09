# folyo

Herkesin kendi sayfasını açıp sosyal hesaplarını bento kartlarla dizdiği kişisel portfolyo platformu.
Sayfa sahibi altı şablondan (Klasik, Samimi, Kurumsal, Minimal, Gece, Editoryal) birini ve bir vurgu rengi seçerek
sayfasına karakter verir.

| Klasör | Ne | Teknoloji |
|---|---|---|
| [`apps/api`](apps/api) | REST API | Spring Boot 4.1 · Java 25 · PostgreSQL 18 · Flyway · Spring Security · Spring Session |
| [`apps/web`](apps/web) | Herkese açık sayfalar ve editör | Next.js 16 (App Router, Cache Components) · React 19 · Tailwind 4 |
| [`apps/mobile`](apps/mobile) | Sayfa sahibi uygulaması | Expo SDK 58 · React Native 0.88 · Expo Router |
| [`deploy`](deploy) | Prod kurulumu | Docker Compose · Caddy (otomatik HTTPS) |

Tarayıcı API'ye her zaman web'in kendi origin'i üzerinden gider (`/api/**`, `/oauth2/**` Spring'e yönlendirilir).
Bu yüzden CORS yoktur; oturum çerezi ve CSRF (`XSRF-TOKEN` çerezi → `X-XSRF-TOKEN` başlığı) aynı origin'de kalır.
Mobil uygulama şifre görmez: web'de onaylanan PKCE kodunu Bearer token'a çevirir.

## Yerel çalıştırma

Gerekenler: Docker, JDK 25, Node 22.

```bash
# 1) API (ilk açılışta compose.yaml'daki Postgres'i kendisi başlatır)
cd apps/api
cp .env.example .env          # en az FOLYO_TOKEN_KEY'i doldur: openssl rand -base64 32
set -a; . ./.env; set +a
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

```bash
# 2) Web
cd apps/web
npm ci
npm run dev -- --port 3100
```

http://localhost:3100 adresini aç. `dev` profilinde giriş sayfasında OAuth kurmadan isimle **Geliştirici girişi** vardır;
bu uç diğer profillerde yoktur.

```bash
# 3) Mobil (isteğe bağlı)
cd apps/mobile
npm ci
npx expo start
```

Widget ve push bildirimleri Expo Go'da çalışmaz; development build gerekir (`npx expo run:android`).
Android emülatöründen bilgisayardaki sunuculara `localhost` ile erişmek için `adb reverse tcp:8080 tcp:8080`,
`tcp:3100` ve `tcp:8081` yönlendirmelerini yap.

## Yapılandırma

Gizli değerler hiçbir zaman repoya girmez. Her uygulamada yalnız boş bir `.env.example` vardır:

| Dosya | İçerik |
|---|---|
| `apps/api/.env.example` | Token şifreleme anahtarı, Google/GitHub girişi, canlı kart sağlayıcıları |
| `apps/web/.env.example` | API ve site adresi (boşsa yerel varsayılanlar) |
| `apps/mobile/.env.example` | API ve web adresi (boşsa yerel varsayılanlar) |
| `deploy/.env.example` | Prod alan adı, veritabanı parolası ve tüm sağlayıcılar |

Canlı kartlar (GitHub, Last.fm, Reddit, Spotify, Strava) için sağlayıcı bilgisi verilmezse kart kırılmaz,
"henüz etkin değil" olarak görünür. Spotify/Strava dönüş adresi: `{web}/api/me/connections/{spotify|strava}/callback`.

## Test

```bash
cd apps/api && ./mvnw verify                              # Testcontainers ile gerçek Postgres; Docker gerekir
cd apps/web && npm run typecheck && npm run lint && npm run build
cd apps/mobile && npx tsc --noEmit && npx eslint src && npx expo-doctor
```

GitHub Actions her uygulamayı yalnız kendi klasörü değiştiğinde test eder (`.github/workflows/`);
`main`'de API ve web imajlarını GHCR'a yayınlar.

## Prod

Tek sunucu, Docker Compose ve Caddy. Adımlar, yedekleme ve güvenlik notları [`deploy/README.md`](deploy/README.md) içinde.

## Güvenlik ve gizlilik özeti

- Ziyaretçi IP'si saklanmaz; tekil sayım günlük tuzlu özetle yapılır, tuz ertesi gün silinir.
- Avatar ve albüm kapakları sunucu üzerinden gösterilir; ziyaretçinin tarayıcısı üçüncü taraflara istek atmaz.
- Spotify/Strava token'ları AES-256-GCM ile şifrelenir; Strava'da yalnız herkese açık aktiviteler gösterilir.
- Yüklenen fotoğraflar yeniden kodlanır; GPS dahil tüm metadata silinir.
- Yazma uçlarında IP başına hız sınırı, oturumlar veritabanında, prod çerezleri `Secure; HttpOnly; SameSite=Lax`.
- Hesap silme web'de ve mobilde vardır; hesapla birlikte tüm veriler, dosyalar ve oturumlar silinir.

## Veri modeli

`users` · `profiles` (kullanıcı adı, tema) · `cards` (tipe özel ayar `jsonb`) · `media` · `guestbook_entries` ·
`connections` (şifreli token) · `activity_events` · günlük istatistik tabloları · `api_tokens` · push outbox ·
`spring_session`. Şema `apps/api/src/main/resources/db/migration` altındadır; her değişiklik yeni bir Flyway migration'ıdır.
