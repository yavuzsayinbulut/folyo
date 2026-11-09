"use client";

import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import { ACCENT_OPTIONS, THEMES, type AccentKey, type ThemeKey } from "@/lib/themes";
import type { Profile } from "@/lib/types";

/** Sayfa sablonu ve vurgu rengi. Secim aninda kaydedilir; onizleme ayni anda degisir. */
export function AppearancePicker({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function choose(theme: ThemeKey, accent: AccentKey | null) {
    if (saving || (theme === profile.theme && accent === profile.accent)) return;
    const previous = profile;
    onSaved({ ...profile, theme, accent });
    setSaving(true);
    setError(null);
    try {
      onSaved(await api<Profile>("/api/me/profile/appearance", { method: "PUT", body: { theme, accent } }));
    } catch (e) {
      onSaved(previous);
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi, tekrar dene.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="appearance" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="appearance" className="font-medium">Görünüm</h2>
      <p className="mt-1 text-sm text-ink-3">Sayfanın karakterini seç. Ziyaretçiler sayfanı bu şablonla görür.</p>

      <div role="radiogroup" aria-label="Şablon" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((theme) => {
          const selected = profile.theme === theme.key;
          const [bg, surface, accent] = theme.swatch;
          return (
            <button
              key={theme.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(theme.key, profile.accent)}
              className={`group relative rounded-xl border p-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
            >
              <span aria-hidden="true" className="flex h-16 flex-col gap-1.5 rounded-lg p-2" style={{ background: bg }} data-theme={theme.key}>
                <span className="flex gap-1.5">
                  <span className="h-5 flex-[2]" style={{ background: surface, borderRadius: "var(--card-radius)" }} />
                  <span className="h-5 flex-1" style={{ background: accent, borderRadius: "var(--card-radius)" }} />
                </span>
                <span className="flex gap-1.5">
                  <span className="h-5 flex-1" style={{ background: surface, borderRadius: "var(--card-radius)" }} />
                  <span className="h-5 flex-1" style={{ background: surface, borderRadius: "var(--card-radius)" }} />
                  <span className="h-5 flex-1" style={{ background: surface, borderRadius: "var(--card-radius)" }} />
                </span>
              </span>
              <span className="mt-2 flex items-center justify-between gap-1 px-0.5">
                <span className="text-sm font-medium">{theme.name}</span>
                {selected && <IconCheck size={15} className="text-accent" aria-hidden="true" />}
              </span>
              <span className="block px-0.5 text-xs leading-snug text-ink-3">{theme.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <p id="accent-label" className="text-sm">Vurgu rengi</p>
        <div role="radiogroup" aria-labelledby="accent-label" className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={profile.accent === null}
            onClick={() => choose(profile.theme, null)}
            className={`h-8 rounded-full border px-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${profile.accent === null ? "border-accent text-ink" : "border-line-strong text-ink-2 hover:text-ink"}`}
          >
            Şablonun rengi
          </button>
          {ACCENT_OPTIONS.map((option) => {
            const selected = profile.accent === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.name}
                title={option.name}
                onClick={() => choose(profile.theme, option.key)}
                className={`inline-flex size-8 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? "ring-2 ring-offset-2 ring-offset-surface ring-ink" : ""}`}
                style={{ background: option.color }}
              >
                {selected && <IconCheck size={14} color="#fff" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
