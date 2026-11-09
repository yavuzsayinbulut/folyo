import "server-only";
import { cache } from "react";
import type { ActivityEvent, GuestbookEntry, PublicPage } from "./types";

const apiUrl = process.env.API_URL || "http://localhost:8080";

/** Ayni istekte metadata ve sayfa ayni veriyi kullanir; React cache tekrar istek atilmasini onler. */
export const getPublicPage = cache(async (username: string): Promise<PublicPage | null> => {
  const res = await fetch(`${apiUrl}/api/public/profiles/${encodeURIComponent(username)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Profil alınamadı: ${res.status}`);
  return res.json();
});

export async function getGuestbook(username: string): Promise<GuestbookEntry[]> {
  const res = await fetch(`${apiUrl}/api/public/profiles/${encodeURIComponent(username)}/guestbook`);
  if (!res.ok) return [];
  return res.json();
}

export async function getActivity(username: string): Promise<ActivityEvent[]> {
  const res = await fetch(`${apiUrl}/api/public/profiles/${encodeURIComponent(username)}/activity`);
  if (!res.ok) return [];
  return res.json();
}
