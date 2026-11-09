import { IconArrowUpRight, IconQuote } from "@tabler/icons-react";
import { displayAddress, handleOf, platformFor } from "@/lib/platforms";
import type { Card, CardSize } from "@/lib/types";
import { LIVE_TYPES } from "@/lib/types";
import { GalleryTile } from "./GalleryTile";
import { LiveCard } from "./live/LiveCard";

const SPAN: Record<CardSize, string> = {
  SMALL: "col-span-1",
  WIDE: "col-span-2",
  LARGE: "col-span-2 row-span-2",
};

/** Ziyaretci sayfasi ile editor onizlemesinde ayni kart cizimi kullanilir. */
export function CardTile({ card, interactive = true }: { card: Card; interactive?: boolean }) {
  const span = SPAN[card.size];

  if (LIVE_TYPES.includes(card.type)) {
    return <LiveCard card={card} interactive={interactive} />;
  }
  if (card.type === "GALLERY") {
    return <GalleryTile card={card} />;
  }
  if (card.type === "TEXT") {
    return (
      <div className={`${span} rounded-[var(--card-radius)] border border-line bg-surface p-4 flex flex-col gap-2 min-w-0`}>
        <IconQuote size={18} className="text-ink-3" aria-hidden="true" />
        <p className={`text-ink leading-relaxed whitespace-pre-line break-words ${card.size === "LARGE" ? "text-lg" : "text-[15px]"}`}>
          {card.config.text}
        </p>
      </div>
    );
  }

  const platform = platformFor(card.config.url);
  const Icon = platform.icon;
  const title = card.config.title || platform.name;
  const handle = platform.key === "web" ? null : handleOf(card.config.url);
  const subtitle = handle ?? displayAddress(card.config.url);
  const big = card.size !== "SMALL";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center justify-center rounded-xl" style={{ background: "var(--tone-bg)", color: "var(--tone-ink)", width: big ? 44 : 36, height: big ? 44 : 36 }}>
          <Icon size={big ? 24 : 20} aria-hidden="true" />
        </span>
        {interactive && <IconArrowUpRight size={16} className="text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />}
      </div>
      <div className="mt-auto min-w-0">
        <p className={`font-medium text-ink truncate ${card.size === "LARGE" ? "text-xl" : "text-[15px]"}`}>{title}</p>
        <p className="text-sm text-ink-2 truncate">{subtitle}</p>
      </div>
    </>
  );

  const className = `tone-${platform.tone} ${span} group rounded-[var(--card-radius)] border border-line bg-surface p-4 flex flex-col gap-6 min-w-0 min-h-[132px] transition duration-200`;

  if (!interactive) return <div className={className}>{body}</div>;
  return (
    <a href={card.config.url} data-card-id={card.id} target="_blank" rel="noopener noreferrer nofollow" className={`${className} hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_-18px_rgba(31,30,28,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:hover:translate-y-0`}>
      {body}
    </a>
  );
}

export function BentoGrid({ cards, interactive = true }: { cards: Card[]; interactive?: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 [grid-auto-flow:dense] auto-rows-[minmax(132px,auto)]">
      {cards.map((card) => (
        <CardTile key={card.id} card={card} interactive={interactive} />
      ))}
    </div>
  );
}
