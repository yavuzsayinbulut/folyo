import Link from "next/link";

export default function ProfileNotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Böyle bir sayfa yok</h1>
      <p className="mt-2 text-ink-2">Bu kullanıcı adı boşta. İstersen senin olabilir.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-accent px-5 text-on-accent font-medium">
        Kendi sayfanı aç
      </Link>
    </main>
  );
}
