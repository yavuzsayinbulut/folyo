"use client";

import { useState } from "react";
import { IconMessage } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import type { GuestbookEntry, Interaction } from "@/lib/types";
import { relativeTime as relative } from "@/lib/time";
import { Avatar } from "./Avatar";
import { InteractionNotice } from "./InteractionNotice";
import { ReportButton } from "./moderation/ReportDialog";

export function Guestbook({
  username,
  initialEntries,
  entriesVisible,
  interaction,
  needsApproval,
}: {
  username: string;
  initialEntries: GuestbookEntry[];
  entriesVisible: boolean;
  interaction: Interaction;
  needsApproval: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const canWrite = interaction === "ALLOWED" || interaction === "OWNER";
  const awaitsApproval = needsApproval && interaction !== "OWNER";

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return setError("Önce bir mesaj yaz");
    if (text.length < 3) return setError("En az 3 karakter yaz");
    setSending(true);
    try {
      await api(`/api/profiles/${username}/guestbook`, { method: "POST", body: { body: text } });
      setBody("");
      if (awaitsApproval) {
        setNotice("Mesajın sayfa sahibine iletildi; onaylarsa burada görünecek.");
      } else if (entriesVisible) {
        setEntries(await api<GuestbookEntry[]>(`/api/public/profiles/${username}/guestbook`));
      } else {
        setNotice("Mesajın kaydedildi.");
      }
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
        {entriesVisible && <span className="text-sm text-ink-3">{entries.length}</span>}
      </div>

      {!canWrite ? (
        <div className="mb-4">
          <InteractionNotice interaction={interaction} username={username} action="Deftere yazmak" />
        </div>
      ) : (
        <form onSubmit={send} className="mb-5">
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setError(null);
                setNotice(null);
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
          ) : notice ? (
            <p role="status" className="mt-2 text-sm text-ok-ink">
              {notice}
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink-3">
              Mesajın adın ve profil fotoğrafınla herkese açık görünür{awaitsApproval ? ", sayfa sahibi onayladıktan sonra" : ""}.
            </p>
          )}
        </form>
      )}

      {!entriesVisible ? (
        <p className="text-sm text-ink-3">Sayfa sahibi defterdeki mesajları herkese göstermiyor.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-3">{canWrite ? "İlk mesajı sen bırak." : "Henüz mesaj yok."}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {entries.map((entry) => (
            <li key={entry.id} className="group flex gap-3">
              <Avatar name={entry.authorName} url={entry.authorAvatarUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{entry.authorName}</span>{" "}
                  <span className="text-ink-3" suppressHydrationWarning>{relative(entry.createdAt)}</span>
                </p>
                <p className="text-[15px] text-ink-2 break-words">{entry.body}</p>
              </div>
              {interaction !== "SIGN_IN" && (
                <ReportButton
                  target="GUESTBOOK"
                  targetId={entry.id}
                  title="Defter yazısını şikayet et"
                  className="size-7 shrink-0 justify-center rounded-full text-ink-3 opacity-0 hover:bg-surface-2 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
