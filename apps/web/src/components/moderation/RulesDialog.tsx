"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, RULES_REQUIRED_EVENT } from "@/lib/client-api";
import { COMMUNITY_RULES, ZERO_TOLERANCE } from "@/lib/rules";

/**
 * Ilk paylasimda (gonderi, yanit, mesaj, defter) sunucu kurallarin kabulunu ister; bu pencere acilir. Kabulden sonra
 * kisi paylasimini tekrar gonderir.
 */
export function RulesDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(RULES_REQUIRED_EVENT, show);
    return () => window.removeEventListener(RULES_REQUIRED_EVENT, show);
  }, []);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/rules/accept", { method: "POST" });
      dialog.current?.close();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi, tekrar dene");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      onClose={() => setOpen(false)}
      aria-labelledby="rules-title"
      className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    >
      <div className="px-5 py-4">
        <h2 id="rules-title" className="text-lg font-semibold">
          Topluluk kuralları
        </h2>
        <p className="mt-1 text-sm text-ink-2">Paylaşmadan önce bir kez kabul etmen gerekiyor.</p>
        <ul className="mt-4 flex flex-col gap-2.5">
          {COMMUNITY_RULES.map((rule) => (
            <li key={rule.title} className="text-sm">
              <span className="font-medium">{rule.title}.</span> <span className="text-ink-2">{rule.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">{ZERO_TOLERANCE}</p>
        <Link href="/kurallar" target="_blank" className="mt-3 inline-block text-sm underline underline-offset-2">
          Kuralların tamamı
        </Link>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <button onClick={() => dialog.current?.close()} className="h-9 rounded-xl px-3 text-sm text-ink-2 hover:bg-surface-2">
          Vazgeç
        </button>
        <button onClick={accept} disabled={busy} className="h-9 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60">
          Kabul ediyorum
        </button>
      </div>
    </dialog>
  );
}
