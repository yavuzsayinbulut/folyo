import type { NextConfig } from "next";

// Spring Boot API. Tarayici API'ye hep bu origin uzerinden gider; cookie ve CSRF ayni origin'de kalir, CORS gerekmez.
// Rewrite hedefi derleme aninda sabitlenir: Docker imajinda API_URL build argumani olarak verilir.
const apiUrl = process.env.API_URL || "http://localhost:8080";
const dev = process.env.NODE_ENV !== "production";

/**
 * Ziyaretcinin tarayicisi yalniz bu siteye istek atar: ucuncu taraf gorseller /_next/image uzerinden sunulur,
 * yazi tipleri derlemede indirilir. Inline script Next'in hidrasyonu icin gereklidir (nonce statik sayfalari bozar).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Video sitenin kendisinden (API) oynatilir; blob: paylasmadan once secilen videonun onizlemesi icin.
  "media-src 'self' blob:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // Avatar ve albüm kapaklari sunucudan gecer: ziyaretcinin IP'si Google/GitHub/Spotify'a gitmez.
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "**.scdn.co" },
      { protocol: "https", hostname: "**.spotifycdn.com" },
      { protocol: "https", hostname: "lastfm.freetls.fastly.net" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/oauth2/:path*", destination: `${apiUrl}/oauth2/:path*` },
      { source: "/login/oauth2/:path*", destination: `${apiUrl}/login/oauth2/:path*` },
    ];
  },
};

export default nextConfig;
