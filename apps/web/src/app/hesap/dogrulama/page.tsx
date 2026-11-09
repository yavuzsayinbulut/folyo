import type { Metadata } from "next";
import { Suspense } from "react";
import { VerificationPanel } from "./VerificationPanel";

export const metadata: Metadata = { title: "Hesabını doğrula", robots: { index: false } };

export default function VerificationPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:py-14">
      <Suspense fallback={<p className="text-ink-3">Yükleniyor…</p>}>
        <VerificationPanel />
      </Suspense>
    </main>
  );
}
