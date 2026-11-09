"use client";

import { useEffect, useState } from "react";
import { IconMessage } from "@tabler/icons-react";
import Link from "next/link";
import { api, ApiError, fetchMe } from "@/lib/client-api";
import type { GuestbookEntry, Me } from "@/lib/types";
import { relativeTime as relative } from "@/lib/time";
import { Avatar } from "./Avatar";

export function Guestbook({ username, initialEntries }: { username: string; initialEntries: GuestbookEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchMe().then(setMe, () => setMe(null));
  }, []);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return setError("Önce bir mesaj yaz");
    if (text.length < 3) return setError("En az 3 karakter yaz");
    setSending(true);
    try {
      await api(`/api/profiles/${username}/guestbook`, { method: "POST", body: { body: text } });
      const fresh = await api<GuestbookEntry[]>(`/api/public/profiles/${username}/guestbook`);
      setEntries(fresh);
      setBody("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Mesaj gönderilemedi");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="guestbook" className="rounded-[var(--card-radius)] border border-line bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <IconMessage size={18} className="text-ink-2" aria-hidden="true" />
        <h2 id="guestbook" className="font-medium">Ziyaretçi defteri</h2>
        <span className="text-sm text-ink-3">{entries.length}</span>
      </div>

      {me === null && (
        <Link href={`/login?next=/${username}`} className="block rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-2 hover:text-ink mb-4">
          Mesaj bırakmak için giriş yap
        </Link>
      )}
      {me && (
        <form onSubmit={send} className="mb-5">
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setError(null);
              }}
              maxLength={280}
              placeholder="Karaköy kareleri harika"
              aria-label="Mesajın"
              className="flex-1 min-w-0 h-10 rounded-xl border border-line-strong bg-bg px-3 text-[15px] outline-none focus:border-accent"
            />
            <button disabled={sending} className="h-10 px-4 rounded-xl bg-accent text-on-accent text-sm font-medium disabled:opacity-60">
              Gönder
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink-3">Mesajın {me.user.name} adı ve profil fotoğrafınla herkese açık görünür.</p>
          )}
        </form>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-ink-3">İlk mesajı sen bırak.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <Avatar name={entry.authorName} url={entry.authorAvatarUrl} size={32} />
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{entry.authorName}</span>{" "}
                  <span className="text-ink-3" suppressHydrationWarning>{relative(entry.createdAt)}</span>
                </p>
                <p className="text-[15px] text-ink-2 break-words">{entry.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
