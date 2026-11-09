import { IconPhoto } from "@tabler/icons-react";
import type { Card } from "@/lib/types";

const SPAN = { SMALL: "col-span-1", WIDE: "col-span-2", LARGE: "col-span-2 row-span-2" } as const;

/**
 * Galeri: kart boyutuna gore en fazla 1, 3 ya da 6 fotograf; fazlasi "+N".
 * 2x2 kartta fotograf sayisina gore mozaik: 1 tam, 2 yan yana, 3 = bir buyuk + iki kucuk, 4-6 = 3x2.
 */
function layout(size: Card["size"], count: number): { grid: string; first: string } {
  if (size === "SMALL" || count <= 1) return { grid: "grid-cols-1", first: "" };
  if (size === "WIDE") return { grid: "grid-cols-3", first: "" };
  if (count === 2) return { grid: "grid-cols-2", first: "" };
  if (count === 3) return { grid: "grid-cols-3 grid-rows-2", first: "col-span-2 row-span-2" };
  return { grid: "grid-cols-3 grid-rows-2", first: "" };
}

export function GalleryTile({ card }: { card: Card }) {
  const media = card.media ?? [];
  const slots = card.size === "LARGE" ? 6 : card.size === "WIDE" ? 3 : 1;
  const shown = media.slice(0, slots);
  const extra = media.length - shown.length;
  const { grid, first } = layout(card.size, shown.length);
  // 2x2 kartta kareler kartin yuksekligini doldurur; digerlerinde kare oranini korur.
  const tileShape = card.size === "LARGE" ? "min-h-24" : "aspect-square";

  return (
    <div className={`tone-pink ${SPAN[card.size]} rounded-[var(--card-radius)] border border-line bg-surface p-2 flex flex-col gap-2 min-w-0 min-h-[132px]`}>
      {shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-ink-3">
          <IconPhoto size={22} aria-hidden="true" />
          <span className="text-sm">{card.config.title ?? "Galeri"}</span>
        </div>
      ) : (
        <div className={`grid ${grid} gap-1.5 flex-1`}>
          {shown.map((item, i) => (
            <a key={item.id} href={item.url} data-card-id={card.id} target="_blank" rel="noopener" className={`relative block overflow-hidden rounded-xl bg-surface-2 ${tileShape} ${i === 0 ? first : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              {extra > 0 && i === shown.length - 1 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white font-medium">+{extra}</span>
              )}
            </a>
          ))}
        </div>
      )}
      {card.config.title && shown.length > 0 && <p className="px-2 pb-1 text-sm text-ink-2 truncate">{card.config.title}</p>}
    </div>
  );
}
