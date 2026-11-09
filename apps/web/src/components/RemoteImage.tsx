import Image from "next/image";

/** next.config.ts images.remotePatterns ile ayni liste. Listede olmayan adres hic yuklenmez. */
const ALLOWED_HOSTS = [/\.googleusercontent\.com$/, /^avatars\.githubusercontent\.com$/, /(^|\.)scdn\.co$/, /\.spotifycdn\.com$/, /^lastfm\.freetls\.fastly\.net$/];

export function proxiable(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && ALLOWED_HOSTS.some((host) => host.test(hostname));
  } catch {
    return false;
  }
}

/**
 * Ucuncu taraf gorseli bu sitenin sunucusu uzerinden gosterir. Ziyaretcinin tarayicisi Google, GitHub ya da
 * Spotify'a istek atmaz; boylece "ziyaretci bilgisi baskasina gitmez" sozu gorsellerde de tutulur.
 */
export function RemoteImage({ src, size, className, alt = "" }: { src: string; size: number; className?: string; alt?: string }) {
  return <Image src={src} alt={alt} width={size} height={size} sizes={`${size}px`} className={className} referrerPolicy="no-referrer" />;
}
