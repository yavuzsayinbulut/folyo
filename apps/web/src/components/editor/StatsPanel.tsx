"use client";

import { useEffect, useState } from "react";
import { IconAlignLeft, IconArrowDownRight, IconArrowUpRight, IconMinus } from "@tabler/icons-react";
import { api } from "@/lib/client-api";
import { displayAddress, platformFor, platformForType } from "@/lib/platforms";
import type { Stats } from "@/lib/types";

const RANGES = [7, 30, 90] as const;
const number = new Intl.NumberFormat("tr-TR");
const shortDay = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function StatsPanel({ username }: { username: string }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Stats>(`/api/me/stats?days=${days}`).then(
      (result) => {
        if (!cancelled) {
          setStats(result);
          setFailed(false);
        }
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">İstatistik</h2>
          <p className="text-sm text-ink-3">Sen kendi sayfanı açınca ve botlar sayılmaz. Ziyaretçi bilgisi saklanmaz.</p>
        </div>
        <div role="radiogroup" aria-label="Dönem" className="inline-flex rounded-xl border border-line-strong p-0.5">
          {RANGES.map((range) => (
            <button
              key={range}
              role="radio"
              aria-checked={days === range}
              onClick={() => setDays(range)}
              className={`h-8 rounded-[10px] px-3 text-sm ${days === range ? "bg-accent text-on-accent" : "text-ink-2 hover:text-ink"}`}
            >
              {range} gün
            </button>
          ))}
        </div>
      </div>

      {failed && <p className="text-sm text-danger">İstatistik yüklenemedi, sayfayı yenile.</p>}
      {!stats && !failed && <p className="text-ink-3">Yükleniyor…</p>}
      {stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Görüntülenme" value={stats.totals.views} previous={stats.previous.views} days={stats.days} />
            <StatTile label="Ziyaretçi" value={stats.totals.visitors} previous={stats.previous.visitors} days={stats.days} />
            <StatTile label="Kart tıklaması" value={stats.totals.clicks} previous={stats.previous.clicks} days={stats.days} />
          </div>
          {stats.totals.views === 0 ? (
            <EmptyState username={username} />
          ) : (
            <>
              <VisitorChart series={stats.series} />
              <TopCards stats={stats} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Deger + onceki ayni uzunluktaki doneme gore degisim. Artis bu metriklerde iyidir. */
function StatTile({ label, value, previous, days }: { label: string; value: number; previous: number; days: number }) {
  let delta: { text: string; tone: string; Icon: typeof IconMinus };
  if (previous === 0) {
    delta = value > 0 ? { text: `önceki ${days} günde yoktu`, tone: "text-ink-3", Icon: IconMinus } : { text: "değişim yok", tone: "text-ink-3", Icon: IconMinus };
  } else {
    const change = Math.round(((value - previous) / previous) * 100);
    delta =
      change > 0
        ? { text: `%${change} artış`, tone: "text-ok-ink", Icon: IconArrowUpRight }
        : change < 0
          ? { text: `%${Math.abs(change)} düşüş`, tone: "text-danger", Icon: IconArrowDownRight }
          : { text: "değişim yok", tone: "text-ink-3", Icon: IconMinus };
  }
  const Icon = delta.Icon;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{number.format(value)}</p>
      <p className={`mt-1 inline-flex items-center gap-1 text-xs ${delta.tone}`}>
        <Icon size={14} aria-hidden="true" />
        {delta.text} <span className="text-ink-3">· önceki {days} güne göre</span>
      </p>
    </div>
  );
}

/** Tek seri: gunluk tekil ziyaretci. Her cubuk uzerine gelince gun, ziyaretci ve goruntulenme gosterir. */
function VisitorChart({ series }: { series: Stats["series"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((d) => d.visitors));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const labelEvery = series.length <= 7 ? 1 : series.length <= 30 ? 7 : 15;

  return (
    <section aria-labelledby="visitor-chart" className="rounded-2xl border border-line bg-surface p-5">
      <h3 id="visitor-chart" className="font-medium">Günlük ziyaretçi</h3>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-2">
        <div className="relative h-44 w-8 text-right text-[11px] text-ink-3 tabular-nums">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (tick / top) * 100}%` }}>
              {number.format(tick)}
            </span>
          ))}
        </div>
        <div className="relative h-44" onMouseLeave={() => setActive(null)}>
          {ticks.map((tick) => (
            <div key={tick} aria-hidden="true" className="absolute inset-x-0 border-t border-line" style={{ top: `${100 - (tick / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((point, i) => (
              <button
                key={point.day}
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${longDay.format(new Date(point.day))}: ${point.visitors} ziyaretçi, ${point.views} görüntülenme`}
                className="relative flex h-full flex-1 items-end justify-center outline-none"
              >
                <span
                  className={`w-full max-w-6 rounded-t-[4px] transition-opacity ${active === null || active === i ? "opacity-100" : "opacity-45"}`}
                  style={{ height: `${(point.visitors / top) * 100}%`, minHeight: point.visitors > 0 ? 2 : 0, background: "var(--chart)" }}
                />
              </button>
            ))}
          </div>
          {active !== null && <Tooltip point={series[active]} left={((active + 0.5) / series.length) * 100} />}
        </div>
        <div />
        <div className="mt-2 flex text-[11px] text-ink-3">
          {series.map((point, i) => (
            <span key={point.day} className="flex-1 text-center whitespace-nowrap">
              {(series.length - 1 - i) % labelEvery === 0 ? shortDay.format(new Date(point.day)) : ""}
            </span>
          ))}
        </div>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink-3 hover:text-ink">Tablo olarak gör</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-normal">Gün</th>
              <th className="py-1 font-normal text-right">Ziyaretçi</th>
              <th className="py-1 font-normal text-right">Görüntülenme</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((point) => (
              <tr key={point.day} className="border-t border-line">
                <td className="py-1">{longDay.format(new Date(point.day))}</td>
                <td className="py-1 text-right">{point.visitors}</td>
                <td className="py-1 text-right">{point.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Tooltip({ point, left }: { point: Stats["series"][number]; left: number }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left: `clamp(60px, ${left}%, calc(100% - 60px))` }}
    >
      <p className="font-medium text-ink">{longDay.format(new Date(point.day))}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-ink-2">
        <span className="size-2 rounded-sm" style={{ background: "var(--chart)" }} aria-hidden="true" />
        {point.visitors} ziyaretçi
      </p>
      <p className="text-ink-3">{point.views} görüntülenme</p>
    </div>
  );
}

/** 0'dan baslayan, okunur 3-4 cizgi: 1, 2, 5 x 10^n adimlari. */
function niceTicks(max: number): number[] {
  const rough = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks = [];
  for (let t = 0; t <= max + step - 1e-9 && ticks.length < 6; t += step) ticks.push(Math.round(t));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function TopCards({ stats }: { stats: Stats }) {
  if (stats.topCards.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line-strong p-5 text-sm text-ink-3">Bu dönemde kartlarına henüz tıklanmadı.</p>;
  }
  const max = stats.topCards[0].clicks;
  return (
    <section aria-labelledby="top-cards" className="rounded-2xl border border-line bg-surface p-5">
      <h3 id="top-cards" className="font-medium mb-3">En çok tıklanan kartlar</h3>
      <ol className="flex flex-col gap-3">
        {stats.topCards.map((card) => {
          const platform = card.type === "LINK" ? platformFor(card.config.url) : platformForType(card.type);
          const Icon = card.type === "TEXT" ? IconAlignLeft : platform.icon;
          const title = card.type === "LINK" ? card.config.title || platform.name : card.type === "GALLERY" ? card.config.title || "Galeri" : platform.name;
          const subtitle = card.type === "LINK" ? displayAddress(card.config.url) : card.config.username ? `@${card.config.username}` : "";
          return (
            <li key={card.cardId} className="flex items-center gap-3">
              <span className={`tone-${platform.tone} inline-flex size-8 shrink-0 items-center justify-center rounded-lg`} style={{ background: "var(--tone-bg)", color: "var(--tone-ink)" }}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {title} <span className="font-normal text-ink-3">{subtitle}</span>
                  </p>
                  <span className="shrink-0 text-sm tabular-nums">{number.format(card.clicks)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-accent-soft" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${(card.clicks / max) * 100}%`, background: "var(--chart)" }} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EmptyState({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/${username}` : `${window.location.origin}/${username}`;
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
      <p className="font-medium">Bu dönemde henüz ziyaret yok</p>
      <p className="mt-1 text-sm text-ink-3">Linkini bio&apos;na koy ya da birine gönder; ilk ziyaret burada görünecek.</p>
      <button
        onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}
        className="mt-4 h-9 rounded-xl border border-line-strong px-4 text-sm hover:bg-surface-2"
      >
        {copied ? "Kopyalandı" : "Linki kopyala"}
      </button>
    </div>
  );
}
