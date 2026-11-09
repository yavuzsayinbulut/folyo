# folyo · Web

Folyo'nun Next.js web uygulaması. Herkese açık bento profilleri, profil editörü,
istatistikler ve mobil giriş onayı bu uygulamadadır.

## Teknoloji

- Next.js 16 App Router ve React 19
- TypeScript ve Tailwind CSS 4
- dnd-kit ile kart sıralama

## Lokal çalıştırma

Önce API'yi (`apps/api`) `http://localhost:8080` üzerinde çalıştırın.

```bash
npm ci
npm run dev -- --port 3100
```

Ardından `http://localhost:3100` adresini açın. API farklı bir adreste çalışıyorsa
`.env.example` dosyasını `.env.local` olarak kopyalayıp `API_URL` değerini verin.

Tarayıcı istekleri `/api/**`, `/oauth2/**` ve `/login/oauth2/**` yollarından Next.js
rewrite ile API'ye gider. Böylece oturum cookie'si ve CSRF aynı origin'de kalır.

## Özellikler

- Link, metin, galeri ve canlı bento kartları
- Herkese açık profil, aktivite akışı ve ziyaretçi defteri
- Profil ve kart editörü
- 7/30/90 günlük istatistikler
- PKCE tabanlı mobil uygulama giriş köprüsü

## Doğrulama

```bash
npm run typecheck   # next typegen + tsc
npm run lint
npm run build
```

`.env*` dosyaları repoya eklenmez; yalnız boş `.env.example` vardır.
