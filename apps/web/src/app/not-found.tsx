import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-3 px-4 py-16">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Böyle bir sayfa yok</h1>
      <p className="text-ink-2">Adres yanlış yazılmış olabilir ya da sayfa sahibi hesabını kapatmış olabilir.</p>
      <Link href="/" className="mt-2 inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-on-accent">
        Kendi sayfanı aç
      </Link>
    </main>
  );
}
