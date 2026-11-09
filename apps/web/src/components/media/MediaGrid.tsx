"use client";

/* eslint-disable @next/next/no-img-element -- medya API'den yetki kontroluyle gelir; Next goruntu iyilestiricisi cerez tasimaz */
import { useCallback, useEffect, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import type { Asset } from "@/lib/types";

/**
 * Gonderideki fotograf/videolar. Izgarada hizli acilan kopya (large/thumb), buyutunce orijinal kalite gosterilir.
 * Video sikistirilmadan oynatilir; tarayici aralikli okuyarak ileri saralabilir.
 */
export function MediaGrid({ media, rounded = "rounded-xl" }: { media: Asset[]; rounded?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (media.length === 0) return null;

  if (media.length === 1 && media[0].kind === "VIDEO") {
    return <VideoPlayer asset={media[0]} className={`${rounded} max-h-[70vh] w-full bg-black`} />;
  }

  const single = media.length === 1;
  const ratio = single && media[0].width && media[0].height ? Math.min(Math.max(media[0].width / media[0].height, 0.6), 2) : null;

  return (
    <>
      <div className={`grid gap-1 overflow-hidden ${rounded} ${single ? "grid-cols-1" : "grid-cols-2"}`}>
        {media.map((asset, i) => (
          <button
            key={asset.id}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`Fotoğrafı büyüt (${i + 1}/${media.length})`}
            className={`relative block overflow-hidden bg-surface-2 ${media.length === 3 && i === 0 ? "row-span-2" : ""}`}
            style={single ? { aspectRatio: ratio ?? 4 / 3, maxHeight: "70vh" } : { aspectRatio: media.length === 3 && i === 0 ? undefined : "1" }}
          >
            <img
              src={single ? asset.largeUrl : asset.thumbUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          </button>
        ))}
      </div>
      {open !== null && <Lightbox media={media} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

export function VideoPlayer({ asset, className }: { asset: Asset; className?: string }) {
  return (
    <video
      src={asset.url}
      poster={asset.posterUrl ?? undefined}
      controls
      playsInline
      preload="metadata"
      className={className}
      style={asset.width && asset.height ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
    />
  );
}

/** Tam ekran: orijinal kalite. Ok tuslari ve Esc calisir. */
export function Lightbox({
  media,
  index,
  onIndex,
  onClose,
}: {
  media: Asset[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const asset = media[index];
  const go = useCallback((delta: number) => onIndex((index + delta + media.length) % media.length), [index, media.length, onIndex]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Fotoğraf" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      {asset.kind === "VIDEO" ? (
        <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] max-w-[94vw]">
          <VideoPlayer asset={asset} className="max-h-[92vh] max-w-[94vw]" />
        </div>
      ) : (
        <img
          src={asset.url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-[92vh] max-w-[94vw] object-contain"
        />
      )}
      <button onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <IconX size={22} aria-hidden="true" />
      </button>
      {media.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Önceki"
            className="absolute left-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <IconChevronLeft size={24} aria-hidden="true" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Sonraki"
            className="absolute right-3 inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <IconChevronRight size={24} aria-hidden="true" />
          </button>
          <p className="absolute bottom-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
            {index + 1} / {media.length}
          </p>
        </>
      )}
    </div>
  );
}
