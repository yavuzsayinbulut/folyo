import { proxiable, RemoteImage } from "./RemoteImage";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toLocaleUpperCase("tr");
}

/** Kullanicinin yukledigi profil fotografi bu sitenin kendi adresinden (API) gelir. */
function ownAsset(url: string | null): url is string {
  return !!url && url.startsWith("/api/public/assets/");
}

export function Avatar({ name, url, size = 64 }: { name: string; url: string | null; size?: number }) {
  if (ownAsset(url)) {
    // Kucuk gosterimlerde 128 px kopya yeterli; buyuklerde 512 px.
    const src = size <= 64 ? url.replace(/\/avatar$/, "/small") : url;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} loading="lazy" />
    );
  }
  // Google/GitHub avatari sunucudan gecer; taninmayan adresler yerine bas harfler gosterilir.
  if (proxiable(url)) {
    return <RemoteImage src={url} size={size} className="rounded-full object-cover shrink-0" />;
  }
  return (
    <span
      aria-hidden="true"
      className="rounded-full shrink-0 inline-flex items-center justify-center bg-accent-soft text-accent-ink font-medium"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials(name)}
    </span>
  );
}
