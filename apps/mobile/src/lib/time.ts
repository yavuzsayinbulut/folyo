/** Web ile ayni zaman bicimleri (lib/time.ts). */
const clock = new Intl.DateTimeFormat("tr", { hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("tr", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("tr", { day: "numeric", month: "long", year: "numeric" });

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Gonderi zamani: "şimdi", "5 dk", "3 sa", "12 Eki". */
export function shortTime(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} sa`;
  return dayMonth.format(date);
}

export function clockTime(iso: string): string {
  return clock.format(new Date(iso));
}

/** Sohbet listesi: bugunse saat, dunse "Dün", degilse tarih. */
export function listTime(iso: string): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (days === 0) return clock.format(date);
  if (days === 1) return "Dün";
  return dayMonth.format(date);
}

/** Mesajlar arasindaki gun ayiraci. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (days === 0) return "Bugün";
  if (days === 1) return "Dün";
  return fullDate.format(date);
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** "son görülme bugün 14:05" gibi. */
export function lastSeen(iso: string): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (days === 0) return `son görülme bugün ${clock.format(date)}`;
  if (days === 1) return `son görülme dün ${clock.format(date)}`;
  return `son görülme ${dayMonth.format(date)} ${clock.format(date)}`;
}
