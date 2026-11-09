"use client";

/* eslint-disable @next/next/no-img-element -- sticker'lar sitenin kendisinden gelir */
import { useEffect, useRef, useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { api, ApiError, upload } from "@/lib/client-api";
import type { Asset, StickerSet } from "@/lib/types";

type Choice = { sticker: string; stickerUrl: string } | { assetId: string; stickerUrl: string };

/** Hazir paketler ve kisinin kendi sticker'lari (seffaf PNG/WebP). Tiklanan sticker hemen gonderilir. */
export function StickerPicker({ onPick, onClose, onError }: { onPick: (c: Choice) => void; onClose: () => void; onError: (e: string) => void }) {
  const [set, setSet] = useState<StickerSet | null>(null);
  const [tab, setTab] = useState<string>("mine");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<StickerSet>("/api/public/stickers").then(
      (s) => {
        setSet(s);
        setTab((t) => (t === "mine" && s.mine.length === 0 && s.packs.length > 0 ? s.packs[0].id : t));
      },
      () => onError("Sticker'lar yüklenemedi"),
    );
  }, [onError]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  async function add(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await upload<Asset>("/api/me/stickers", file);
      setSet((s) => s && { ...s, mine: [...s.mine, asset] });
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Sticker eklenemedi");
    } finally {
      setUploading(false);
    }
  }

  async function remove(asset: Asset) {
    try {
      await api(`/api/me/stickers/${asset.id}`, { method: "DELETE" });
      setSet((s) => s && { ...s, mine: s.mine.filter((m) => m.id !== asset.id) });
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Silinemedi");
    }
  }

  const pack = set?.packs.find((p) => p.id === tab);
  const cell = "relative flex aspect-square items-center justify-center rounded-xl p-1 hover:bg-surface-2";

  return (
    <div ref={box} role="dialog" aria-label="Sticker seç" className="absolute bottom-full left-2 z-20 mb-2 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
      <div className="flex gap-1 overflow-x-auto border-b border-line p-2">
        <button onClick={() => setTab("mine")} aria-current={tab === "mine" ? "page" : undefined} className={`h-8 shrink-0 rounded-lg px-2.5 text-sm ${tab === "mine" ? "bg-surface-2 font-medium" : "text-ink-2"}`}>
          Benim
        </button>
        {set?.packs.map((p) => (
          <button key={p.id} onClick={() => setTab(p.id)} aria-current={tab === p.id ? "page" : undefined} className={`h-8 shrink-0 rounded-lg px-2.5 text-sm ${tab === p.id ? "bg-surface-2 font-medium" : "text-ink-2"}`}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="grid max-h-72 grid-cols-4 gap-1 overflow-y-auto p-2">
        {!set ? (
          <p className="col-span-4 p-4 text-center text-sm text-ink-3">Yükleniyor…</p>
        ) : tab === "mine" ? (
          <>
            {set.mine.map((s) => (
              <div key={s.id} className="group relative">
                <button onClick={() => onPick({ assetId: s.id, stickerUrl: s.url.replace(/\/original$/, "/sticker") })} aria-label="Sticker gönder" className={`${cell} w-full`}>
                  <img src={s.url.replace(/\/original$/, "/sticker")} alt="" className="size-full object-contain" loading="lazy" />
                </button>
                <button
                  onClick={() => remove(s)}
                  aria-label="Sticker'ı sil"
                  className="absolute right-0.5 top-0.5 hidden size-6 items-center justify-center rounded-full bg-surface text-ink-3 shadow group-hover:inline-flex hover:text-danger"
                >
                  <IconTrash size={13} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button onClick={() => fileInput.current?.click()} disabled={uploading} className={`${cell} flex-col gap-1 border border-dashed border-line-strong text-xs text-ink-3`}>
              <IconPlus size={20} aria-hidden="true" />
              {uploading ? "Yükleniyor" : "Ekle"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                add(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p className="col-span-4 px-1 pt-1 text-xs text-ink-3">Kendi sticker&apos;ın: şeffaf PNG ya da WebP, en fazla 1 MB.</p>
          </>
        ) : (
          pack?.stickers.map((s) => (
            <button key={s.id} onClick={() => onPick({ sticker: s.id, stickerUrl: s.url })} aria-label={s.title} title={s.title} className={cell}>
              <img src={s.url} alt="" className="size-full object-contain" loading="lazy" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
