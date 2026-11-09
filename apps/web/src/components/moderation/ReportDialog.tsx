"use client";

import { useEffect, useRef, useState } from "react";
import { IconFlag, IconX } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import type { ReportReason, ReportTarget } from "@/lib/types";

export const REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam ya da yanıltıcı" },
  { value: "HARASSMENT", label: "Taciz ya da zorbalık" },
  { value: "HATE", label: "Nefret söylemi" },
  { value: "SEXUAL", label: "Müstehcen içerik" },
  { value: "VIOLENCE", label: "Şiddet ya da tehdit" },
  { value: "SELF_HARM", label: "Kendine zarar verme" },
  { value: "IMPERSONATION", label: "Başkasını taklit ediyor" },
  { value: "ILLEGAL", label: "Yasa dışı içerik" },
  { value: "OTHER", label: "Başka bir neden" },
];

/** Sikayet penceresi. Gonderen kimligi sahibe gosterilmez; istenirse yazar da engellenir. */
export function ReportDialog({
  target,
  targetId,
  title,
  canBlock = true,
  onClose,
}: {
  target: ReportTarget;
  targetId: string;
  title: string;
  canBlock?: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [block, setBlock] = useState(false);
  const [state, setState] = useState<"form" | "sending" | "done">("form");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return setError("Bir neden seç");
    setState("sending");
    setError(null);
    try {
      await api("/api/me/reports", { method: "POST", body: { targetType: target, targetId, reason, note: note.trim() || null, block } });
      setState("done");
    } catch (e) {
      setState("form");
      setError(e instanceof ApiError ? e.message : "Gönderilemedi, tekrar dene");
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-labelledby="report-title"
      className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="report-title" className="font-medium">
          {title}
        </h2>
        <button onClick={() => dialog.current?.close()} aria-label="Kapat" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
          <IconX size={18} aria-hidden="true" />
        </button>
      </div>
      {state === "done" ? (
        <div className="px-5 py-6 text-sm">
          <p className="font-medium">Teşekkürler, şikayetini aldık.</p>
          <p className="mt-1 text-ink-2">Ekibimiz inceleyecek; kurallara aykırıysa içerik kaldırılır. Şikayet edenin kimliği karşı tarafa gösterilmez.</p>
          {block && <p className="mt-1 text-ink-2">Bu kişiyi engelledin; sana yazamaz.</p>}
          <button onClick={() => dialog.current?.close()} className="mt-4 h-9 rounded-xl bg-accent px-4 font-medium text-on-accent">
            Tamam
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 px-5 py-4">
          <fieldset>
            <legend className="mb-2 text-sm text-ink-2">Neden şikayet ediyorsun?</legend>
            <div className="grid gap-1.5">
              {REASONS.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2 has-[:checked]:bg-accent-soft">
                  <input type="radio" name="reason" checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-[var(--accent)]" />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            Ek bilgi (isteğe bağlı)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="resize-none rounded-xl border border-line-strong bg-bg px-3 py-2 outline-none focus:border-accent" />
          </label>
          {canBlock && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="size-4 accent-[var(--accent)]" />
              Bu kişiyi de engelle
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="h-9 rounded-xl px-3 text-sm text-ink-2 hover:bg-surface-2">
              Vazgeç
            </button>
            <button disabled={state === "sending"} className="h-9 rounded-xl bg-danger px-4 text-sm font-medium text-white disabled:opacity-60">
              {state === "sending" ? "Gönderiliyor…" : "Şikayet et"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** Kucuk bayrak dugmesi; tiklaninca sikayet penceresi acilir. */
export function ReportButton({
  target,
  targetId,
  title,
  label = "Şikayet et",
  showLabel = false,
  canBlock,
  className = "",
}: {
  target: ReportTarget;
  targetId: string;
  title: string;
  label?: string;
  showLabel?: boolean;
  canBlock?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={label} title={label} className={`inline-flex items-center gap-1 ${className}`}>
        <IconFlag size={showLabel ? 14 : 16} aria-hidden="true" />
        {showLabel && <span>{label}</span>}
      </button>
      {open && <ReportDialog target={target} targetId={targetId} title={title} canBlock={canBlock} onClose={() => setOpen(false)} />}
    </>
  );
}
