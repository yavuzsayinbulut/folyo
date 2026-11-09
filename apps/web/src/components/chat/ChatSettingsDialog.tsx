"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import type { BlockedUser, ChatSettings, LastSeenAudience } from "@/lib/types";
import { Avatar } from "../Avatar";

const LAST_SEEN: { value: LastSeenAudience; label: string; hint: string }[] = [
  { value: "EVERYONE", label: "Herkes", hint: "Sohbet ettiğin herkes çevrimiçi olduğunu ve son görülmeni görür." },
  { value: "CHATS", label: "Yalnız yazıştıklarım", hint: "Yalnız karşılıklı mesajlaştığın kişiler görür." },
  { value: "NOBODY", label: "Hiç kimse", hint: "Kimse görmez; sen de başkalarınınkini göremezsin." },
];

/** Son gorulme, okundu bilgisi ve engellenen kisiler. */
export function ChatSettingsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    api<ChatSettings>("/api/me/chat-settings").then(setSettings, () => setError("Ayarlar yüklenemedi"));
    api<BlockedUser[]>("/api/me/blocks").then(setBlocked, () => setBlocked([]));
  }, []);

  async function save(next: ChatSettings) {
    const previous = settings;
    setSettings(next);
    setSaved(false);
    try {
      await api("/api/me/chat-settings", { method: "PUT", body: next });
      setSaved(true);
      onChanged();
    } catch (e) {
      setSettings(previous);
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi");
    }
  }

  async function unblock(user: BlockedUser) {
    try {
      await api(`/api/me/blocks/${user.userId}`, { method: "DELETE" });
      setBlocked((list) => list && list.filter((b) => b.userId !== user.userId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Engel kaldırılamadı");
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-labelledby="chat-settings-title"
      className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="chat-settings-title" className="font-medium">
          Sohbet ayarları
        </h2>
        <button onClick={() => dialog.current?.close()} aria-label="Kapat" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
          <IconX size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto px-5 py-4">
        {!settings ? (
          <p className="text-sm text-ink-3">{error ?? "Yükleniyor…"}</p>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Çevrimiçi ve son görülme</legend>
              <div className="flex flex-col gap-2">
                {LAST_SEEN.map((option) => (
                  <label key={option.value} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent">
                    <input
                      type="radio"
                      name="last-seen"
                      checked={settings.lastSeenAudience === option.value}
                      onChange={() => save({ ...settings, lastSeenAudience: option.value })}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <span>
                      <span className="block text-sm">{option.label}</span>
                      <span className="block text-xs text-ink-3">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={settings.readReceipts}
                onChange={(e) => save({ ...settings, readReceipts: e.target.checked })}
                className="mt-1 size-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium">Okundu bilgisi (mavi tik)</span>
                <span className="block text-xs text-ink-3">Kapatırsan karşı taraf mesajını okuduğunu görmez; sen de onlarınkini göremezsin.</span>
              </span>
            </label>
            {saved && (
              <p role="status" className="-mt-3 text-xs text-ok-ink">
                Kaydedildi
              </p>
            )}
          </>
        )}

        <section aria-labelledby="blocked-title">
          <h3 id="blocked-title" className="mb-2 text-sm font-medium">
            Engellenenler
          </h3>
          {!blocked ? (
            <p className="text-sm text-ink-3">Yükleniyor…</p>
          ) : blocked.length === 0 ? (
            <p className="text-sm text-ink-3">Kimseyi engellemedin.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {blocked.map((b) => (
                <li key={b.userId} className="flex items-center gap-3">
                  <Avatar name={b.name} url={b.avatarUrl} size={34} />
                  <span className="min-w-0 flex-1 truncate text-sm">{b.name}</span>
                  <button onClick={() => unblock(b)} className="h-8 rounded-lg border border-line-strong px-2.5 text-sm hover:bg-surface-2">
                    Engeli kaldır
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {error && settings && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
