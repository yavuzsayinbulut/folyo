import { Suspense } from "react";
import { LoginPanel } from "./LoginPanel";

export const metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Giriş yap</h1>
      <p className="mt-1 text-ink-2">Sayfanı yönetmek ya da mesaj bırakmak için.</p>
      <Suspense>
        <LoginPanel />
      </Suspense>
    </main>
  );
}
