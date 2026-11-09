# folyo · API

Folyo portfolyo platformunun Spring Boot API'si.

## Teknoloji

- Java 25 ve Spring Boot 4.1
- PostgreSQL 18, Spring Data JPA ve Flyway
- Spring Security, OAuth2 ve mobil Bearer token
- Testcontainers ile entegrasyon testleri

## Lokal çalıştırma

Docker açık olmalıdır. Uygulama ilk açılışta `compose.yaml` içindeki PostgreSQL'i başlatır.
Token şifreleme anahtarı her profilde zorunludur; `.env.example` dosyasını `.env` olarak kopyalayıp
en az `FOLYO_TOKEN_KEY` değerini doldurun (`openssl rand -base64 32`).

```bash
cp .env.example .env
set -a; . ./.env; set +a
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

API varsayılan olarak `http://localhost:8080` adresinde çalışır. `dev` profilinde OAuth
kurmadan kullanılabilen geliştirici girişi açıktır.

## Yapılandırma

Tüm ayarlar ortam değişkeniyle verilir; tam liste `.env.example` içindedir.
Boş bırakılan sağlayıcı kapalı kalır, uygulama yine açılır.

- `FOLYO_LOGIN_GOOGLE_CLIENT_ID/SECRET`, `FOLYO_LOGIN_GITHUB_CLIENT_ID/SECRET` (giriş)
- `FOLYO_GITHUB_TOKEN`
- `FOLYO_LASTFM_API_KEY`
- `FOLYO_REDDIT_CLIENT_ID`, `FOLYO_REDDIT_CLIENT_SECRET`
- `FOLYO_SPOTIFY_CLIENT_ID`, `FOLYO_SPOTIFY_CLIENT_SECRET`
- `FOLYO_STRAVA_CLIENT_ID`, `FOLYO_STRAVA_CLIENT_SECRET`
- `FOLYO_TOKEN_KEY`
- `FOLYO_EXPO_ACCESS_TOKEN`
- `FOLYO_MEDIA_DIR`

Secret değerleri repoya eklenmez; yalnız boş `.env.example` vardır. Testler şifreleme
anahtarını her çalıştırmada rastgele üretir.

## Veri ve güvenlik

Flyway migration'ları `src/main/resources/db/migration` altındadır. Yeni şema değişikliği
mevcut migration değiştirilmeden yeni bir sürüm olarak eklenir.

Spotify ve Strava token'ları AES-256-GCM ile şifrelenir. Galeri görselleri yeniden
kodlanarak EXIF ve GPS metadata'sından temizlenir. Push bildirimleri transactional outbox
ve `FOR UPDATE SKIP LOCKED` ile dağıtılır.

## Test

```bash
./mvnw test
```

Testler Docker üzerinde gerçek PostgreSQL ile çalışır.
