"use client";

/* eslint-disable @next/next/no-img-element -- yerel onizleme (blob:) */
import { useEffect, useRef, useState } from "react";
import { IconMoodSmile, IconPaperclip, IconSend, IconX } from "@tabler/icons-react";
import { ApiError, upload } from "@/lib/client-api";
import { sendRealtime } from "@/lib/realtime";
import type { Asset, MessageKind } from "@/lib/types";
import { StickerPicker } from "./StickerPicker";

const MAX_BODY = 4000;
const MAX_CAPTION = 1000;

export type Outgoing = {
  kind: MessageKind;
  body?: string | null;
  asset?: Asset | null;
  /** Kendi sticker'in (asset kimligi). */
  assetId?: string;
  /** Hazir paketten sticker (paket/ad). */
  sticker?: string;
  stickerUrl?: string;
};

type Pending = { file: File; preview: string; kind: "PHOTO" | "VIDEO"; progress: number; asset: Asset | null; abort: AbortController };

/**
 * Mesaj yazma: Enter gonderir, Shift+Enter yeni satir. Yazarken karsi tarafa en fazla 2 sn'de bir "yaziyor"
 * sinyali gider. Fotograf/video secilince hemen yuklenir; gonder'e basinca yazilan metin aciklama olur.
 */
export function ChatComposer({ conversationId, onSend, onError }: { conversationId: string; onSend: (o: Outgoing) => void; onError: (e: string) => void }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [stickers, setStickers] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  const pendingRef = useRef(pending);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(
    () => () => {
      const p = pendingRef.current;
      if (p) {
        URL.revokeObjectURL(p.preview);
        if (!p.asset) p.abort.abort();
      }
    },
    [],
  );

  // Metin kutusu icerikle birlikte (en fazla 6 satir) buyur.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  function typing() {
    const now = Date.now();
    if (now - lastTyping.current > 2000) {
      lastTyping.current = now;
      sendRealtime({ type: "typing", conversationId });
    }
  }

  function pick(file: File | undefined) {
    if (!file) return;
    const video = file.type.startsWith("video/");
    if (!video && !file.type.startsWith("image/")) return onError("Yalnız fotoğraf ya da video gönderilebilir");
    if (file.size > (video ? 200 : 25) * 1024 * 1024) return onError(video ? "Video en fazla 200 MB olabilir" : "Fotoğraf en fazla 25 MB olabilir");
    if (pending) clear();
    const next: Pending = { file, preview: URL.createObjectURL(file), kind: video ? "VIDEO" : "PHOTO", progress: 0, asset: null, abort: new AbortController() };
    setPending(next);
    upload<Asset>(video ? "/api/me/assets/videos" : "/api/me/assets/photos", file, {
      signal: next.abort.signal,
      onProgress: (progress) => setPending((p) => (p && p.preview === next.preview ? { ...p, progress } : p)),
    }).then(
      (asset) => setPending((p) => (p && p.preview === next.preview ? { ...p, asset, progress: 1 } : p)),
      (e) => {
        setPending((p) => (p && p.preview === next.preview ? null : p));
        URL.revokeObjectURL(next.preview);
        if (!(e instanceof ApiError && e.status === 0 && next.abort.signal.aborted)) onError(e instanceof ApiError ? e.message : "Yüklenemedi");
      },
    );
  }

  function clear() {
    if (!pending) return;
    URL.revokeObjectURL(pending.preview);
    if (!pending.asset) pending.abort.abort();
    setPending(null);
  }

  function submit() {
    const text = body.trim();
    if (pending) {
      if (!pending.asset) return;
      if (text.length > MAX_CAPTION) return onError(`Açıklama en fazla ${MAX_CAPTION} karakter olabilir`);
      onSend({ kind: pending.kind, asset: pending.asset, body: text || null });
      URL.revokeObjectURL(pending.preview);
      setPending(null);
      setBody("");
      return;
    }
    if (!text) return;
    if (text.length > MAX_BODY) return onError(`Mesaj en fazla ${MAX_BODY} karakter olabilir`);
    onSend({ kind: "TEXT", body: text });
    setBody("");
  }

  return (
    <div className="relative border-t border-line bg-surface px-3 py-2">
      {stickers && (
        <StickerPicker
          onClose={() => setStickers(false)}
          onPick={(choice) => {
            setStickers(false);
            onSend({ kind: "STICKER", ...choice });
          }}
          onError={onError}
        />
      )}
      {pending && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-2 p-2">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-black">
            {pending.kind === "VIDEO" ? (
              <video src={pending.preview} muted playsInline className="size-full object-cover" />
            ) : (
              <img src={pending.preview} alt="" className="size-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate">{pending.file.name}</p>
            {pending.asset ? (
              <p className="text-xs text-ink-3">Hazır · orijinal kalitede gönderilecek. İstersen açıklama yaz.</p>
            ) : (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Yükleniyor" aria-valuenow={Math.round(pending.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(pending.progress * 100)}%` }} />
              </div>
            )}
          </div>
          <button onClick={clear} aria-label="Vazgeç" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface">
            <IconX size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1">
        <button onClick={() => setStickers((s) => !s)} aria-label="Sticker" aria-expanded={stickers} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2">
          <IconMoodSmile size={22} aria-hidden="true" />
        </button>
        <button onClick={() => fileInput.current?.click()} aria-label="Fotoğraf ya da video gönder" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2">
          <IconPaperclip size={21} aria-hidden="true" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <label htmlFor={`chat-input-${conversationId}`} className="sr-only">
          Mesaj
        </label>
        <textarea
          id={`chat-input-${conversationId}`}
          ref={textarea}
          value={body}
          rows={1}
          autoFocus
          onChange={(e) => {
            setBody(e.target.value);
            if (e.target.value) typing();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={pending ? "Açıklama ekle" : "Mesaj yaz"}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-line-strong bg-bg px-3 py-2 text-[15px] leading-snug outline-none focus:border-accent"
        />
        <button
          onClick={submit}
          disabled={pending ? !pending.asset : !body.trim()}
          aria-label="Gönder"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent disabled:opacity-40"
        >
          <IconSend size={19} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
