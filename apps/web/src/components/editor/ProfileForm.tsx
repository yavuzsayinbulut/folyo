"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import type { Profile, Visibility } from "@/lib/types";

const field = "h-10 w-full rounded-xl border border-line-strong bg-bg px-3 outline-none focus:border-accent";

export function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [form, setForm] = useState({
    displayName: profile.displayName,
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    timezone: profile.timezone ?? "",
    status: profile.status ?? "",
    visibility: profile.visibility,
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.displayName.trim()) return setMessage({ ok: false, text: "Görünen adını yaz" });
    setSaving(true);
    try {
      onSaved(await api<Profile>("/api/me/profile", { method: "PATCH", body: form }));
      setMessage({ ok: true, text: "Kaydedildi" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "Kaydedilemedi" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-medium mb-4">Profil</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Görünen ad
          <input className={field} value={form.displayName} maxLength={60} onChange={(e) => set("displayName", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Durum rozeti
          <input className={field} value={form.status} maxLength={40} placeholder="Projelere açık" onChange={(e) => set("status", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Biyografi
          <textarea
            className="min-h-20 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 outline-none focus:border-accent"
            value={form.bio}
            maxLength={280}
            placeholder="Backend geliştirici. Hafta sonları film fotoğrafı."
            onChange={(e) => set("bio", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Konum
          <input className={field} value={form.location} maxLength={60} placeholder="İstanbul" onChange={(e) => set("location", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Saat dilimi
          <select className={field} value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
            <option value="">Gösterme</option>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="sm:col-span-2 flex flex-col gap-1 text-sm">
          <legend className="mb-1">Görünürlük</legend>
          <div className="flex gap-2">
            {(
              [
                ["PUBLIC", "Herkese açık"],
                ["UNLISTED", "Yalnız linki bilen"],
              ] as [Visibility, string][]
            ).map(([value, label]) => (
              <label key={value} className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 text-center ${form.visibility === value ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong"}`}>
                <input type="radio" name="visibility" value={value} checked={form.visibility === value} onChange={() => set("visibility", value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button disabled={saving} className="h-10 rounded-xl bg-accent px-4 text-on-accent text-sm font-medium disabled:opacity-60">
          Kaydet
        </button>
        {message && <span className={`text-sm ${message.ok ? "text-ok-ink" : "text-danger"}`}>{message.text}</span>}
      </div>
    </form>
  );
}
