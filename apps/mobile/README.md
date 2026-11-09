# folyo · Mobil

Folyo sayfa sahipleri için Expo/React Native mobil uygulaması.

## Teknoloji

- Expo SDK 58 ve React Native 0.88
- Expo Router
- Secure Store ile oturum token'ı
- Expo Notifications ve Expo Widgets
- expo-image (fotoğraf, SVG sticker), expo-video (videolar), expo-image-picker (dosyalar kalite 1 ile, yeniden sıkıştırılmadan)
- Anlık sohbet: uygulama ön plandayken Bearer token'lı tek WebSocket; arka plana geçince kapanır, yeni mesaj bildirim olarak gelir

Sekmeler: Sayfa, Keşfet (gönderiler, yeni gönderi), Sohbetler (istekler, arşiv, sohbet ayarları), Paylaş, Profil
(profil fotoğrafı). Yerel modül eklendiğinde geliştirme derlemesi yenilenir: `npx expo run:android`.

## Lokal çalıştırma

```bash
npm ci
cp .env.example .env
npx expo start
```

Boş bırakılan `EXPO_PUBLIC_API_URL` ve `EXPO_PUBLIC_WEB_URL` yerel varsayılanları
(`localhost:8080`, `localhost:3100`) kullanır. `.env` dosyası repoya eklenmez.

## Giriş

Uygulama şifre almaz. Sistem tarayıcısında web girişini açar ve PKCE challenge için
üretilen tek kullanımlık kodu erişim token'ına çevirir. Token Keychain/Keystore'da
tutulur ve API'ye Bearer token olarak gönderilir.

## Özellikler

- Kart ekleme, sıralama, boyutlandırma, gizleme ve silme
- Galeriye fotoğraf ekleme
- 7/30/90 günlük istatistikler
- QR kod ile profil paylaşımı
- Profil ve bildirim tercihleri
- Push bildirimleri ve ana ekran widget'ı

## Native geliştirme

Widget ve push bildirimleri Expo Go'da çalışmaz; development build gerekir.

```bash
ANDROID_HOME=<android-sdk-yolu> npx expo run:android
```

Android emülatörünün host servislerine erişmesi için gerekli portları `adb reverse`
ile yönlendirin. iOS derlemesi için Expo SDK 58'in desteklediği Xcode/macOS sürümü gerekir.

## Doğrulama

```bash
npx tsc --noEmit
npx expo lint
```
