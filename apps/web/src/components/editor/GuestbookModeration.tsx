"use client";

import { useCallback, useEffect, useState } from "react";
import { IconEye, IconEyeOff, IconTrash } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import type { GuestbookEntry } from "@/lib/types";
import { useConfirm } from "../ConfirmDialog";

export function GuestbookModeration() {
  const [entries, setEntries] = useState<GuestbookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(
    () =>
      api<GuestbookEntry[]>("/api/me/guestbook").then(
        (list) => {
          setEntries(list);
          setError(null);
        },
        () => setError("Mesajlar yüklenemedi."),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem yapılamadı, tekrar dene.");
    }
    await load();
  }

  const toggle = (entry: GuestbookEntry) =>
    act(() => api(`/api/me/guestbook/${entry.id}`, { method: "PATCH", body: { status: entry.status === "VISIBLE" ? "HIDDEN" : "VISIBLE" } }));

  async function remove(entry: GuestbookEntry) {
    const ok = await confirm({
      title: "Mesaj silinsin mi?",
      body: `${entry.authorName} kişisinin mesajı kalıcı olarak silinecek. Yalnız saklamak istiyorsan gizlemeyi kullan.`,
      confirmLabel: "Sil",
      danger: true,
    });
    if (ok) await act(() => api(`/api/me/guestbook/${entry.id}`, { method: "DELETE" }));
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-medium mb-4">Ziyaretçi defteri</h2>
      {error && (
        <p role="alert" className="mb-3 flex items-center gap-3 text-sm text-danger">
          {error}
          {entries === null && (
            <button onClick={load} className="text-ink-2 underline underline-offset-2">
              Tekrar dene
            </button>
          )}
        </p>
      )}
      {entries === null ? (
        !error && <p className="text-sm text-ink-3">Yükleniyor…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-3">Henüz mesaj yok. Sayfanı paylaştıkça burada görünecek.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.id} className={`flex items-start gap-3 py-2.5 ${entry.status === "HIDDEN" ? "opacity-55" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {entry.authorName} {entry.status === "HIDDEN" && <span className="font-normal text-ink-3">· gizli</span>}
                </p>
                <p className="text-sm text-ink-2 break-words">{entry.body}</p>
              </div>
              <button
                onClick={() => toggle(entry)}
                aria-label={entry.status === "VISIBLE" ? `${entry.authorName} mesajını gizle` : `${entry.authorName} mesajını göster`}
                title={entry.status === "VISIBLE" ? "Gizle" : "Göster"}
                className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2"
              >
                {entry.status === "VISIBLE" ? <IconEye size={16} aria-hidden="true" /> : <IconEyeOff size={16} aria-hidden="true" />}
              </button>
              <button
                onClick={() => remove(entry)}
                aria-label={`${entry.authorName} mesajını sil`}
                title="Sil"
                className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-danger"
              >
                <IconTrash size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </section>
  );
}
