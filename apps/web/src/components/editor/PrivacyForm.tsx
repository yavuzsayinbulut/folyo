"use client";

import { useState } from "react";
import { IconShieldLock } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import type { Audience, InteractionPolicy, Privacy, Profile } from "@/lib/types";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  EVERYONE: "Herkes",
  SIGNED_IN: "Giriş yapanlar",
  VERIFIED: "Doğrulanmış hesaplar",
  ONLY_ME: "Yalnız ben",
};

const POLICY_LABELS: Record<InteractionPolicy, string> = {
  VERIFIED: "Doğrulanmış herkes",
  APPROVAL: "Onayımdan sonra",
  NOBODY: "Kimse",
};

const SEE: { key: keyof Pick<Privacy, "profile" | "location" | "localTime" | "activity" | "guestbook">; label: string; hint: string }[] = [
  { key: "profile", label: "Sayfamı kim görebilir", hint: "Seçilmeyenler sayfanın yerine 'giriş yap / doğrula' uyarısı görür." },
  { key: "location", label: "Konumumu", hint: "" },
  { key: "localTime", label: "Yerel saatimi", hint: "" },
  { key: "activity", label: "Aktivite akışımı", hint: "GitHub, Reddit ve Strava hareketleri" },
  { key: "guestbook", label: "Defterdeki mesajları", hint: "Okumayı kısıtlar; kimin yazabileceği aşağıda." },
];

/** Kim gorebilir / kim yazabilir. Sunucu her istekte ayni kurali uygular; bu form yalniz secimi kaydeder. */
export function PrivacyForm({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [form, setForm] = useState<Privacy>(profile.privacy);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof Privacy>(key: K, value: Privacy[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await api<Profile>("/api/me/privacy", { method: "PUT", body: form });
      onSaved(saved);
      setForm(saved.privacy);
      setMessage({ ok: true, text: "Kaydedildi" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "Kaydedilemedi" });
    } finally {
      setSaving(false);
    }
  }

  const select = "h-10 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm outline-none focus:border-accent";

  return (
    <form onSubmit={save} aria-labelledby="privacy" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="privacy" className="flex items-center gap-2 font-medium">
        <IconShieldLock size={18} className="text-ink-2" aria-hidden="true" /> Gizlilik
      </h2>
      <p className="mt-1 text-sm text-ink-3">
        Doğrulanmış hesap: e-postası ve telefonu doğrulanmış kullanıcı. Yazmak için her durumda doğrulama gerekir.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Kim görebilir</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {SEE.map(({ key, label, hint }) => (
            <label key={key} className={`flex flex-col gap-1 text-sm ${key === "profile" ? "sm:col-span-2" : ""}`}>
              {label}
              <select className={select} value={form[key]} onChange={(e) => set(key, e.target.value as Audience)}>
                {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((value) => (
                  <option key={value} value={value}>
                    {AUDIENCE_LABELS[value]}
                  </option>
                ))}
              </select>
              {hint && <span className="text-xs text-ink-3">{hint}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Kim yazabilir</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Deftere yorum
            <select className={select} value={form.comments} onChange={(e) => set("comments", e.target.value as InteractionPolicy)}>
              {(Object.keys(POLICY_LABELS) as InteractionPolicy[]).map((value) => (
                <option key={value} value={value}>
                  {POLICY_LABELS[value]}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-3">Onayımdan sonra: yorumlar sen onaylayınca görünür.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Bana özel mesaj
            <select className={select} value={form.messages} onChange={(e) => set("messages", e.target.value as InteractionPolicy)}>
              {(Object.keys(POLICY_LABELS) as InteractionPolicy[]).map((value) => (
                <option key={value} value={value}>
                  {POLICY_LABELS[value]}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-3">Onayımdan sonra: mesajlar önce İstekler klasörüne düşer.</span>
          </label>
        </div>
      </fieldset>

      <label className="mt-5 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.indexable}
          disabled={form.profile !== "EVERYONE"}
          onChange={(e) => set("indexable", e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>
          Arama motorlarında görünsün
          <span className="block text-xs text-ink-3">
            {form.profile === "EVERYONE" ? "Kapalıysa sayfan yalnız linki bilenlere açık kalır." : "Herkese açık olmayan sayfa arama motorlarında görünmez."}
          </span>
        </span>
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button disabled={saving} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60">
          Kaydet
        </button>
        {message && (
          <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-ok-ink" : "text-danger"}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
