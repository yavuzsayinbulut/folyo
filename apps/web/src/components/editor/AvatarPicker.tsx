"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconCamera, IconSparkles } from "@tabler/icons-react";
import { api, ApiError, upload } from "@/lib/client-api";
import type { AvatarStatus } from "@/lib/types";
import { Avatar } from "../Avatar";

const SOURCE: Record<string, string> = {
  SPOTIFY: "Spotify profil fotoğrafın",
  STRAVA: "Strava profil fotoğrafın",
};

function autoLabel(auto: NonNullable<AvatarStatus["auto"]>): string {
  return SOURCE[auto.source] ?? `Bağlı hesaplarından üretildi: ${auto.platforms.join(", ")}`;
}

/**
 * Profil fotografi. Kendi fotografini yuklemezsen sayfadaki hesaplara gore otomatik gorsel kullanilir: OAuth ile
 * bagli hesapta (Spotify, Strava) fotograf varsa o, yoksa platformlarin renk ve motiflerinden ozgun bir gorsel.
 * Yuklenen dosya kirpilmadan saklanir; konum gibi gizli bilgiler silinir.
 */
export function AvatarPicker({ name, url, onChange }: { name: string; url: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ust bilesen her render'da yeni bir onChange verebilir; yuklemeyi yeniden tetiklemesin diye ref'te tutulur.
  const latest = useRef({ url, onChange });
  useEffect(() => {
    latest.current = { url, onChange };
  });

  const load = useCallback(() => {
    api<AvatarStatus>("/api/me/avatar").then(
      (s) => {
        setStatus(s);
        if (s.avatarUrl !== latest.current.url) latest.current.onChange(s.avatarUrl);
      },
      () => undefined,
    );
  }, []);

  // Kart eklenip cikarilinca otomatik gorsel arka planda yenilenir; editor acikken ara ara tazelenir.
  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Bir fotoğraf seç");
    if (file.size > 25 * 1024 * 1024) return setError("Fotoğraf en fazla 25 MB olabilir");
    setError(null);
    setProgress(0);
    try {
      await upload<{ avatarUrl: string }>("/api/me/avatar", file, { method: "PUT", onProgress: setProgress });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Yüklenemedi");
    } finally {
      setProgress(null);
    }
  }

  async function useAutomatic() {
    try {
      await api("/api/me/avatar", { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaldırılamadı");
    }
  }

  const uploaded = !!status?.uploadedUrl;
  const auto = status?.auto ?? null;

  return (
    <section aria-labelledby="avatar" className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
      <button onClick={() => input.current?.click()} className="group relative shrink-0 rounded-full" aria-label="Profil fotoğrafını değiştir">
        <Avatar name={name} url={status?.avatarUrl ?? url} size={72} />
        <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 text-white group-hover:flex">
          <IconCamera size={22} aria-hidden="true" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <h2 id="avatar" className="font-medium">
          Profil fotoğrafı
        </h2>
        <p className="text-sm text-ink-3">
          {!status
            ? "Yükleniyor…"
            : uploaded
              ? "Kendi yüklediğin fotoğraf."
              : auto
                ? (
                    <span className="inline-flex items-center gap-1">
                      <IconSparkles size={14} className="shrink-0 text-accent" aria-hidden="true" />
                      Otomatik · {autoLabel(auto)}
                    </span>
                  )
                : status.accountUrl
                  ? "Giriş hesabının fotoğrafı. Sayfana hesap ekledikçe otomatik bir görsel oluşur."
                  : "Sayfana hesap ekledikçe otomatik bir görsel oluşur ya da kendi fotoğrafını yükle."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={() => input.current?.click()} disabled={progress !== null} className="h-9 rounded-xl border border-line-strong px-3 text-sm hover:bg-surface-2 disabled:opacity-60">
            {progress !== null ? `Yükleniyor %${Math.round(progress * 100)}` : "Fotoğraf yükle"}
          </button>
          {uploaded && (
            <button onClick={useAutomatic} className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
              {auto && <Avatar name={name} url={auto.url} size={22} />}
              {auto ? "Otomatik görsele dön" : "Fotoğrafı kaldır"}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-3">JPEG, PNG ya da WebP, en fazla 25 MB. Kalitesi korunur, konum bilgisi silinir.</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}
