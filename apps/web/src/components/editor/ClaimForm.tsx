"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import type { Me, Profile } from "@/lib/types";
import { useAvailability } from "@/lib/useAvailability";

export function ClaimForm({ me, initialUsername, onClaimed }: { me: Me; initialUsername: string; onClaimed: (p: Profile) => void }) {
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(me.user.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const availability = useAvailability(username);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!username.trim()) return setError("Bir kullanıcı adı yaz");
    if (!displayName.trim()) return setError("Görünen adını yaz");
    setSaving(true);
    try {
      onClaimed(await api<Profile>("/api/me/profile", { method: "POST", body: { username, displayName } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sayfa açılamadı");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Sayfanı aç</h1>
      <p className="mt-1 text-ink-2">Merhaba {me.user.name}. Adresini seç, sonra kartlarını ekle.</p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Adresin</span>
          <div className="flex items-center rounded-xl border border-line-strong bg-surface px-3 focus-within:border-accent">
            <span className="text-ink-3">folyo.app/</span>
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="adin"
              className="h-11 flex-1 min-w-0 bg-transparent outline-none"
            />
          </div>
          <span className={`h-5 text-sm ${availability.kind === "unavailable" ? "text-danger" : "text-ok-ink"}`}>
            {availability.kind === "available" && "Boşta"}
            {availability.kind === "unavailable" && availability.reason}
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Görünen ad</span>
          <input
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setError(null);
            }}
            maxLength={60}
            className="h-11 rounded-xl border border-line-strong bg-surface px-3 outline-none focus:border-accent"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={saving} className="h-11 rounded-xl bg-accent text-on-accent font-medium disabled:opacity-60">
          Sayfamı oluştur
        </button>
      </form>
    </main>
  );
}
