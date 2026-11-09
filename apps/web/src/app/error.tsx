"use client";

import Link from "next/link";

/** Beklenmeyen hata (ornegin API'ye ulasilamiyor): teknik ayrinti gostermeden tekrar deneme sunulur. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-3 px-4 py-16">
      <p className="text-sm font-medium text-accent">Bir sorun çıktı</p>
      <h1 className="text-2xl font-semibold tracking-tight">Sayfa şu an yüklenemedi</h1>
      <p className="text-ink-2">Bu genellikle kısa süreli bir bağlantı sorunudur. Biraz sonra tekrar dene.</p>
      <div className="mt-2 flex gap-2">
        <button onClick={reset} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent">
          Tekrar dene
        </button>
        <Link href="/" className="inline-flex h-10 items-center rounded-xl px-4 text-sm text-ink-2 hover:bg-surface-2">
          Ana sayfa
        </Link>
      </div>
    </main>
  );
}
