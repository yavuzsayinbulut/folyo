import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { ActivityEvent, GuestbookEntry, Me, PostPage, PostThread, PublicPage, RestrictedPage } from "./types";

const apiUrl = process.env.API_URL || "http://localhost:8080";

export type PageResult = { kind: "page"; page: PublicPage } | { kind: "restricted"; restricted: RestrictedPage } | null;

/**
 * Sayfanin icerigi bakan kisiye gore degisir (gizlilik secimleri). Ziyaretcinin oturum cerezi API'ye aynen iletilir;
 * metadata ve paylasim gorseli ise hep anonim bakisla uretilir ki gizli bilgi onizlemelere sizmasin.
 */
async function viewerHeaders(asViewer: boolean): Promise<HeadersInit> {
  if (!asViewer) return {};
  const cookie = (await cookies()).toString();
  return cookie ? { cookie } : {};
}

/** Ayni istekte metadata ve sayfa ayni veriyi kullanir; React cache tekrar istek atilmasini onler. */
export const getPublicPage = cache(async (username: string, asViewer: boolean): Promise<PageResult> => {
  const res = await fetch(`${apiUrl}/api/public/profiles/${encodeURIComponent(username)}`, {
    headers: await viewerHeaders(asViewer),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (res.status === 403) return { kind: "restricted", restricted: await res.json() };
  if (!res.ok) throw new Error(`Profil alınamadı: ${res.status}`);
  return { kind: "page", page: await res.json() };
});

export async function getGuestbook(username: string): Promise<GuestbookEntry[]> {
  const res = await fetch(`${apiUrl}/api/public/profiles/${encodeURIComponent(username)}/guestbook`, {
    headers: await viewerHeaders(true),
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getActivity(username: string): Promise<ActivityEvent[]> {
  const res = await fetch(`${apiUrl}/api/public/profiles/${encodeURIComponent(username)}/activity`, {
    headers: await viewerHeaders(true),
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

/** Oturumdaki kisi; giris yoksa null. */
export async function getMe(): Promise<Me | null> {
  const headers = await viewerHeaders(true);
  if (!("cookie" in headers)) return null;
  const res = await fetch(`${apiUrl}/api/me`, { headers, cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

/** Kesfet ya da bir sayfanin gonderileri; bakan kisinin gorebildigi kadariyla. */
export async function getPosts(path: string): Promise<PostPage> {
  const res = await fetch(`${apiUrl}${path}`, { headers: await viewerHeaders(true), cache: "no-store" });
  if (!res.ok) return { posts: [], next: null };
  return res.json();
}

/** asViewer false: metadata/onizleme icin anonim bakis; gizli gonderi metni baglanti onizlemesine sizmaz. */
export async function getPostThread(id: string, asViewer = true): Promise<PostThread | null> {
  const res = await fetch(`${apiUrl}/api/public/posts/${encodeURIComponent(id)}`, {
    headers: await viewerHeaders(asViewer),
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Gönderi alınamadı: ${res.status}`);
  return res.json();
}
