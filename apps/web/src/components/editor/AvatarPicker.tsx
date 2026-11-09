"use client";

import { useRef, useState } from "react";
import { IconCamera } from "@tabler/icons-react";
import { api, ApiError, upload } from "@/lib/client-api";
import { Avatar } from "../Avatar";

/**
 * Profil fotografi: yuklenen dosya kirpilmadan saklanir, sayfada kare kopyasi gosterilir; konum gibi gizli
 * bilgiler silinir. Kaldirilirsa giris yapilan hesabin (Google/GitHub) fotografi geri gelir.
 */
export function AvatarPicker({ name, url, onChange }: { name: string; url: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const own = !!url && url.startsWith("/api/public/assets/");

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Bir fotoğraf seç");
    if (file.size > 25 * 1024 * 1024) return setError("Fotoğraf en fazla 25 MB olabilir");
    setError(null);
    setProgress(0);
    try {
      const result = await upload<{ avatarUrl: string }>("/api/me/avatar", file, { method: "PUT", onProgress: setProgress });
      onChange(result.avatarUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Yüklenemedi");
    } finally {
      setProgress(null);
    }
  }

  async function remove() {
    try {
      await api("/api/me/avatar", { method: "DELETE" });
      onChange(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaldırılamadı");
    }
  }

  return (
    <section aria-labelledby="avatar" className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
      <button onClick={() => input.current?.click()} className="group relative shrink-0 rounded-full" aria-label="Profil fotoğrafını değiştir">
        <Avatar name={name} url={url} size={72} />
        <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 text-white group-hover:flex">
          <IconCamera size={22} aria-hidden="true" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <h2 id="avatar" className="font-medium">
          Profil fotoğrafı
        </h2>
        <p className="text-sm text-ink-3">JPEG, PNG ya da WebP, en fazla 25 MB. Kalitesi korunur, konum bilgisi silinir.</p>
        <div className="mt-2 flex gap-2">
          <button onClick={() => input.current?.click()} disabled={progress !== null} className="h-9 rounded-xl border border-line-strong px-3 text-sm hover:bg-surface-2 disabled:opacity-60">
            {progress !== null ? `Yükleniyor %${Math.round(progress * 100)}` : "Fotoğraf yükle"}
          </button>
          {own && (
            <button onClick={remove} className="h-9 rounded-xl px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-danger">
              Kaldır
            </button>
          )}
        </div>
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
