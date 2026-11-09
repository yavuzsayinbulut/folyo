"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IconBrandGithub, IconBrandGoogle, IconCode } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import { safeNext } from "@/lib/useAvailability";

const PROVIDERS: Record<string, { label: string; icon: typeof IconBrandGoogle }> = {
  google: { label: "Google ile devam et", icon: IconBrandGoogle },
  github: { label: "GitHub ile devam et", icon: IconBrandGithub },
};

export function LoginPanel() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next")) ?? "/edit";
  const [providers, setProviders] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then(setProviders, () => setProviders([]));
  }, []);

  async function devLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Bir isim yaz");
    try {
      await api("/api/dev/login", { method: "POST", body: { name: name.trim() } });
      router.replace(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Giriş yapılamadı");
    }
  }

  if (providers === null) return <p className="mt-8 text-ink-3">Yükleniyor…</p>;

  return (
    <div className="mt-8 flex flex-col gap-3">
      {providers
        .filter((p) => PROVIDERS[p])
        .map((p) => {
          const { label, icon: Icon } = PROVIDERS[p];
          return (
            <a key={p} href={`/oauth2/authorization/${p}${next === "/edit" ? "" : `?next=${encodeURIComponent(next)}`}`} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface font-medium hover:bg-surface-2">
              <Icon size={18} aria-hidden="true" /> {label}
            </a>
          );
        })}

      {providers.includes("dev") && (
        <form onSubmit={devLogin} className="mt-2 rounded-2xl border border-dashed border-line-strong p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <IconCode size={16} aria-hidden="true" /> Geliştirici girişi
          </p>
          <p className="mt-1 text-sm text-ink-3">Yalnız lokal ortamda görünür.</p>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Ada L."
              aria-label="İsim"
              className="flex-1 min-w-0 h-10 rounded-xl border border-line-strong bg-bg px-3 outline-none focus:border-accent"
            />
            <button className="h-10 rounded-xl bg-accent px-4 text-on-accent text-sm font-medium">Gir</button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </form>
      )}

      {providers.length === 0 && <p className="text-ink-3">Şu an giriş yöntemi tanımlı değil.</p>}
    </div>
  );
}
