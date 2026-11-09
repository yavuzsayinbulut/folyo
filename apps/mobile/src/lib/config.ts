/** Mobil uygulama Spring API'ye dogrudan, Bearer token ile gider; giris icin web sayfasini kullanir. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || "http://localhost:3100";

// Yayin derlemesinde token duz HTTP ile gonderilmez: adres eksik ya da https degilse uygulama hemen hata verir
// (EAS profilleri EXPO_PUBLIC_API_URL/WEB_URL'i verir; eas.json).
if (!__DEV__) {
  for (const [name, url] of [["EXPO_PUBLIC_API_URL", API_URL], ["EXPO_PUBLIC_WEB_URL", WEB_URL]]) {
    if (!url.startsWith("https://")) throw new Error(`${name} yayin derlemesinde https olmali: ${url}`);
  }
}

/** Sunucunun dondurdugu "/api/public/media/..." gibi goreli adresleri tam adrese cevirir. */
export function absolute(path: string): string {
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}
