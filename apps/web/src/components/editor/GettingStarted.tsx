"use client";

import { useState, useSyncExternalStore } from "react";
import { IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import type { Card, Profile } from "@/lib/types";

const DISMISSED_KEY = "folyo.gettingStarted.dismissed";
const SHARED_KEY = "folyo.gettingStarted.shared";

/** Tarayiciya ozel kucuk tercihler; depolama kapaliysa (gizli pencere) varsayilan deger kullanilir. */
function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // depolama yoksa yalniz bu oturumda gecerli
  }
  window.dispatchEvent(new Event("folyo-local"));
}

function useFlag(key: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("folyo-local", notify);
      return () => window.removeEventListener("folyo-local", notify);
    },
    () => read(key),
    () => true,
  );
}

/** Yeni kullaniciya sayfasini tamamlatan kisa liste. Hepsi bitince ya da kapatilinca bir daha gorunmez. */
export function GettingStarted({ profile, cards, pageUrl }: { profile: Profile; cards: Card[]; pageUrl: string }) {
  const dismissed = useFlag(DISMISSED_KEY);
  const shared = useFlag(SHARED_KEY);
  const visibleCards = cards.filter((c) => c.visible).length;

  const steps = [
    { done: !!profile.bio?.trim(), label: "Kendini bir cümleyle anlat", hint: "Profil bölümünde biyografini yaz." },
    { done: visibleCards >= 3, label: "En az 3 kart ekle", hint: `${visibleCards}/3 · Instagram, GitHub, Spotify ya da bir metin kartı.` },
    { done: profile.theme !== "CLASSIC" || profile.accent !== null, label: "Sayfana karakter ver", hint: "Görünüm bölümünden bir şablon ve renk seç." },
    { done: shared, label: "Linkini paylaş", hint: "Bio'na, imzana ya da kartvizitine ekle." },
  ];
  const remaining = steps.filter((s) => !s.done).length;
  if (dismissed || remaining === 0) return null;

  return (
    <section aria-labelledby="getting-started" className="rounded-2xl border border-accent/30 bg-accent-soft/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="getting-started" className="font-medium">
            Başlarken
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            {steps.length - remaining}/{steps.length} tamamlandı
          </p>
        </div>
        <button onClick={() => write(DISMISSED_KEY)} aria-label="Başlarken listesini kapat" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink">
          <IconX size={16} aria-hidden="true" />
        </button>
      </div>
      <ol className="mt-4 flex flex-col gap-3">
        {steps.map((step) => (
          <li key={step.label} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${step.done ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface"}`}
            >
              {step.done && <IconCheck size={13} />}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${step.done ? "text-ink-3 line-through" : ""}`}>
                {step.label}
                <span className="sr-only">{step.done ? " (tamamlandı)" : ""}</span>
              </p>
              {!step.done && <p className="text-xs text-ink-2">{step.hint}</p>}
            </div>
          </li>
        ))}
      </ol>
      {!shared && <CopyLink url={pageUrl} className="mt-4" />}
    </section>
  );
}

/** Sayfa adresini panoya kopyalar ve "paylasildi" adimini isaretler. */
export function CopyLink({ url, className = "", compact = false }: { url: string; className?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      write(SHARED_KEY);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Linkini kopyala", url);
    }
  }

  return (
    <button
      onClick={copy}
      aria-live="polite"
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm hover:bg-surface-2 ${className}`}
    >
      {copied ? <IconCheck size={15} className="text-ok-ink" aria-hidden="true" /> : <IconCopy size={15} aria-hidden="true" />}
      {copied ? "Kopyalandı" : compact ? "Linki kopyala" : `${url.replace(/^https?:\/\//, "")} · kopyala`}
    </button>
  );
}
