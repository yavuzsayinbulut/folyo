import { Suspense } from "react";
import { MobileHandoff } from "./MobileHandoff";

export const metadata = { title: "Uygulamaya giriş", robots: { index: false } };

export default function MobileLoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-24">
      <Suspense fallback={<p className="text-ink-3">Yükleniyor…</p>}>
        <MobileHandoff />
      </Suspense>
    </main>
  );
}
