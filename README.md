# folyo

Herkesin kendi sayfasını açıp sosyal hesaplarını bento kartlarla dizdiği kişisel portfolyo platformu.
Sayfa sahibi altı şablondan (Klasik, Samimi, Kurumsal, Minimal, Gece, Editoryal) birini ve bir vurgu rengi seçerek
sayfasına karakter verir. Kısa gönderiler (fotoğraf/video ile) paylaşır, Keşfet'te doğrulanmış hesapların paylaşımlarını
görür, WhatsApp benzeri anlık sohbet eder (çevrimiçi, yazıyor, mavi tik, sticker). Mesaj ve yorum için e-postası ve
telefonu doğrulanmış olmak gerekir. Sayfa sahibi kimin neyi görebileceğini ve kimin yazabileceğini kendisi ayarlar.

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

## Doğrulama, mesajlar ve gizlilik

- **Doğrulama:** E-posta ve telefon 6 haneli kodla doğrulanır (10 dk geçerli, 5 yanlış denemede yanar, kod yalnız özet olarak
  saklanır). Google/GitHub'ın doğruladığı e-posta ayrıca kod istemez. Bir telefon yalnız bir hesapta doğrulanabilir.
- **Yönetim (`/admin`):** `FOLYO_ADMIN_EMAILS` listesindeki doğrulanmış e-posta yönetici olur. SMS (Twilio, Netgsm) ve
  e-posta (SMTP) entegrasyonu panelden seçilir; parolalar şifreli saklanır. Hangi doğrulamaların zorunlu olduğu da panelden
  belirlenir. Geliştirmede kodlar gönderilmez, API loguna yazılır (`admin@folyo.test` geliştirme yöneticisidir).
- **İletişim kutusu → sohbet:** Doğrulanmış ziyaretçi sayfadaki kutudan sohbet başlatır; sahip "Onayımdan sonra" seçtiyse
  sohbet İstekler'e düşer ve kabul edilene kadar en fazla 5 mesaj gidebilir. Gönderenin e-postası ve telefonu gösterilmez.
- **Gizlilik:** Sayfa, konum, yerel saat, aktivite ve defter için "Herkes / Giriş yapanlar / Doğrulanmışlar / Yalnız ben";
  her kart için ayrı kitle; yorum ve mesaj için "Doğrulanmış herkes / Onayımdan sonra / Kimse". Kurallar sunucuda uygulanır;
  sayfa içeriği bakan kişiye göre üretilir, bağlantı önizlemeleri hep anonim bakışla oluşur.

## Gönderiler, medya ve sohbet

- **Gönderiler:** En fazla 500 karakter, 4 fotoğraf ya da 1 video. Kitle: Herkes / Giriş yapanlar / Doğrulanmışlar.
  Profil akışı ve Keşfet (`/kesfet`, yalnız doğrulanmış yazarlar), beğeni, tek seviye yanıt (sayfa sahibinin yorum
  kuralına uyar, "onayımdan sonra" ise onay bekler). Akışlar `(created_at, id)` imleciyle sayfalanır; OFFSET yoktur.
- **Keşfet "Senin için":** En yeni 500 aday gönderi tek sorguda puanlanır:
  `(beğeni + 2×yanıt + 1) / (saat + 2)^1.5`; bakan kişinin son 90 günde beğendiği, yanıtladığı ya da sohbet ettiği
  yazarlar sınırlı bir çarpanla (en fazla 2×) öne çıkar; aynı yazarın her sonraki gönderisi 0,6 ile çarpılır (tek
  yazar akışı dolduramaz). Kendi gönderin ve iki yönlü engellenen yazarlar çıkarılır; kitle kuralları aynen geçerlidir
  (giriş yapmamış ziyaretçi yalnız "Herkes" gönderilerini, kişiselleştirme olmadan görür). Sıralanmış liste 30 dk
  saklanır; aşağı kaydırırken sıra değişmez, tekrar ya da kayıp olmaz. Katsayılar `folyo.feed.*` ile ayarlanır.
  "En yeni" sekmesi tarihe göre kalır.
- **Medya (kalite korunur):** Kayıt veritabanında (`media_assets`), dosya depoda. Fotoğraf yeniden kodlanmaz: JPEG/PNG/WebP
  dosyasından yalnız konum ve kişisel meta veri blokları çıkarılır, renk profili ve yön bilgisi kalır. Listeler için
  480/1600 px kopyalar ayrıca üretilir; dokununca orijinal açılır. Video `ffmpeg -c copy` ile yeniden paketlenir (yeniden
  kodlama yok), meta veri silinir, kapak karesi çıkarılır; oynatıcı aralıklı (Range) okur. Profil fotoğrafı kare
  kopyalarla sunulur. Medya izinleri her istekte kontrol edilir (gönderiyi gören görür, sohbet medyasını yalnız iki taraf).
- **Depo:** Yönetim panelinden sunucu diski ya da S3 uyumlu depo (AWS S3, R2, MinIO…) seçilir; eski dosyalar yüklendikleri
  depoda okunmaya devam eder. Kullanılmayan yüklemeler saatlik temizlenir.
- **Sohbet:** Mesajlar HTTP ile kaydedilir (istemci kimliğiyle tekrar denemede çift kayıt olmaz); `/api/realtime`
  WebSocket'i yeni mesaj, tik, "yazıyor" ve çevrimiçi bilgisini anında taşır. Tek tik: sunucuda; çift: karşı cihaza
  ulaştı; mavi: okundu (iki taraf da okundu bilgisini açıksa). Son görülme: Herkes / Yalnız yazıştıklarım / Hiç kimse
  (gizleyen başkasınınkini de göremez). Herkesten silme 48 saat içinde. Uygulama kapalıysa push bildirimi gider.
- **Sticker:** İki hazır paket (özgün çizimler) ve kişinin kendi şeffaf PNG/WebP sticker'ları.

## Güvenlik ve gizlilik özeti

- Ziyaretçi IP'si saklanmaz; tekil sayım günlük tuzlu özetle yapılır, tuz ertesi gün silinir.
- Avatar ve albüm kapakları sunucu üzerinden gösterilir; ziyaretçinin tarayıcısı üçüncü taraflara istek atmaz.
- Spotify/Strava token'ları AES-256-GCM ile şifrelenir; Strava'da yalnız herkese açık aktiviteler gösterilir.
- Yüklenen fotoğraf ve videolardan GPS dahil kişisel meta veri silinir; görüntü/ses verisine dokunulmaz.
- Yazma uçlarında IP başına hız sınırı, oturumlar veritabanında, prod çerezleri `Secure; HttpOnly; SameSite=Lax`.
- Hesap silme web'de ve mobilde vardır; hesapla birlikte tüm veriler, dosyalar ve oturumlar silinir.

## Veri modeli

`users` · `profiles` (kullanıcı adı, tema) · `cards` (tipe özel ayar `jsonb`) · `media` · `media_assets` · `posts` ·
`post_media` · `post_likes` · `conversations` · `conversation_members` (teslim/okundu sıra no) · `chat_messages` ·
`guestbook_entries` · `connections` (şifreli token) · `activity_events` · günlük istatistik tabloları · `api_tokens` ·
push outbox · `platform_settings` · `spring_session`. Şema `apps/api/src/main/resources/db/migration` altındadır; her değişiklik yeni bir Flyway migration'ıdır.
