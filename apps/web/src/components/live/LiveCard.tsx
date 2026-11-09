"use client";

import { useEffect, useState } from "react";
import { IconArrowUpRight, IconStar, IconUsers } from "@tabler/icons-react";
import { platformForType } from "@/lib/platforms";
import { proxiable, RemoteImage } from "../RemoteImage";
import { relativeTime } from "@/lib/time";
import type { Card, GitHubLive, LiveView, RedditLive, StravaLive, TrackLive } from "@/lib/types";

const SPAN = { SMALL: "col-span-1", WIDE: "col-span-2", LARGE: "col-span-2 row-span-2" } as const;

/** Muzik kartlari 30 sn'de bir tazelenir; digerleri sayfa acilisinda bir kez yuklenir. */
const POLL_MS: Partial<Record<Card["type"], number>> = { SPOTIFY: 30_000, LASTFM: 30_000 };

export function LiveCard({ card, interactive = true }: { card: Card; interactive?: boolean }) {
  const [live, setLive] = useState<LiveView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/public/cards/${card.id}/live`)
        .then((r) => (r.ok ? r.json() : null))
        .then((view: LiveView | null) => !cancelled && setLive(view))
        .catch(() => !cancelled && setLive(null));
    load();
    const every = POLL_MS[card.type];
    const timer = every ? setInterval(load, every) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [card.id, card.type]);

  const platform = platformForType(card.type);
  const Icon = platform.icon;
  const ok = live && (live.status === "OK" || live.status === "STALE") && live.data;
  const href = ok ? linkOf(card, live) : profileLink(card);

  const body = !live ? (
    <Skeleton />
  ) : ok ? (
    <LiveBody card={card} view={live} />
  ) : (
    <Fallback card={card} status={live.status} />
  );

  const className = `tone-${platform.tone} ${SPAN[card.size]} group relative rounded-[var(--card-radius)] border border-line bg-surface p-4 flex flex-col min-w-0 min-h-[132px] overflow-hidden`;
  const header = (
    <div className="flex items-start justify-between gap-2 mb-3">
      <span className="inline-flex size-9 items-center justify-center rounded-xl" style={{ background: "var(--tone-bg)", color: "var(--tone-ink)" }}>
        <Icon size={20} aria-hidden="true" />
      </span>
      {live?.status === "STALE" && <span className="text-[11px] text-ink-3">son bilinen</span>}
      {interactive && href && <IconArrowUpRight size={16} className="text-ink-3" aria-hidden="true" />}
    </div>
  );

  if (interactive && href) {
    return (
      <a href={href} data-card-id={card.id} target="_blank" rel="noopener noreferrer nofollow" className={`${className} transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_-18px_rgba(31,30,28,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:hover:translate-y-0`}>
        {header}
        {body}
      </a>
    );
  }
  return (
    <div className={className}>
      {header}
      {body}
    </div>
  );
}

function LiveBody({ card, view }: { card: Card; view: LiveView }) {
  switch (card.type) {
    case "GITHUB":
      return <GitHubBody data={view.data as GitHubLive} size={card.size} />;
    case "REDDIT":
      return <RedditBody data={view.data as RedditLive} />;
    case "SPOTIFY":
    case "LASTFM":
      return <TrackBody data={view.data as TrackLive} size={card.size} />;
    case "STRAVA":
      return <StravaBody data={view.data as StravaLive} size={card.size} />;
    default:
      return null;
  }
}

const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });

const LEVEL_COLORS = ["var(--line)", "#9fe1cb", "#5dcaa5", "#1d9e75", "#0f6e56"];

function GitHubBody({ data, size }: { data: GitHubLive; size: Card["size"] }) {
  const weeks = size === "SMALL" ? 10 : 26;
  // Seviyeler pazardan baslayan haftalar halinde gelir; son (yarim) hafta korunarak son N sutun alinir.
  const tail = (weeks - 1) * 7 + (data.contributionLevels.length % 7 || 7);
  const levels = data.contributionLevels.slice(-tail);
  return (
    <div className="mt-auto flex flex-col gap-3 min-w-0">
      {levels.length > 0 && (
        // Hucreler kart genisligine gore olceklenir: grafik her boyutta karti doldurur, hafta kirpilmaz.
        <div
          className="grid grid-flow-col gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${Math.ceil(levels.length / 7)}, minmax(0, 1fr))`, gridTemplateRows: "repeat(7, auto)" }}
          aria-label={`Son ${weeks} haftada ${data.activeDays} gün katkı`}
        >
          {levels.map((level, i) => (
            <span key={i} className="aspect-square w-full rounded-[2px]" style={{ background: LEVEL_COLORS[level] ?? LEVEL_COLORS[0] }} />
          ))}
        </div>
      )}
      <div className="min-w-0">
        <p className="font-medium truncate">{data.name ?? data.login}</p>
        <p className="text-sm text-ink-2 flex flex-wrap gap-x-3">
          <span>@{data.login}</span>
          <span className="inline-flex items-center gap-1"><IconUsers size={14} aria-hidden="true" />{compact.format(data.followers)}</span>
          {size !== "SMALL" && <span>{data.publicRepos} repo</span>}
        </p>
      </div>
      {size === "LARGE" && data.topRepos.length > 0 && (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {data.topRepos.map((repo) => (
            <li key={repo.name} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="truncate">{repo.name}</span>
              <span className="shrink-0 inline-flex items-center gap-1 text-ink-3">
                {repo.language && <span>{repo.language}</span>}
                <IconStar size={13} aria-hidden="true" />
                {repo.stars}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrackBody({ data, size }: { data: TrackLive; size: Card["size"] }) {
  if (!data.title) {
    return <p className="mt-auto text-sm text-ink-3">Henüz dinlenen bir şey yok</p>;
  }
  const label = data.nowPlaying ? "Şu an dinliyor" : data.playedAt ? `Son dinlenen · ${relativeTime(data.playedAt)}` : "Son dinlenen";
  const big = size === "LARGE";
  return (
    <div className={`mt-auto flex gap-3 min-w-0 ${big ? "flex-col" : "items-center"}`}>
      {proxiable(data.imageUrl) && (
        <RemoteImage src={data.imageUrl} size={big ? 320 : 56} className={`${big ? "w-full h-auto aspect-square" : "size-14"} rounded-lg object-cover shrink-0`} />
      )}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          {data.nowPlaying && <Equalizer />}
          <span suppressHydrationWarning>{label}</span>
        </p>
        <p className="font-medium truncate">{data.title}</p>
        <p className="text-sm text-ink-2 truncate">{data.artist}</p>
      </div>
    </div>
  );
}

function Equalizer() {
  return (
    <span className="inline-flex items-end gap-[2px] h-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] rounded-sm bg-[var(--tone-ink)] animate-[eq_0.9s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.15}s`, height: "100%" }} />
      ))}
    </span>
  );
}

function RedditBody({ data }: { data: RedditLive }) {
  return (
    <div className="mt-auto min-w-0">
      <p className="font-medium">{compact.format(data.totalKarma)} karma</p>
      <p className="text-sm text-ink-2 truncate">
        u/{data.name}
        {data.createdAt && <> · {new Date(data.createdAt).getFullYear()}&apos;den beri</>}
      </p>
    </div>
  );
}

function StravaBody({ data, size }: { data: StravaLive; size: Card["size"] }) {
  const km = (m: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(m / 1000);
  const last = data.lastActivity;
  return (
    <div className="mt-auto flex flex-col gap-2 min-w-0">
      {last ? (
        <div className="min-w-0">
          <p className="text-xs text-ink-3" suppressHydrationWarning>Son aktivite · {relativeTime(last.startDate)}</p>
          <p className="font-medium truncate">
            {km(last.distanceMeters)} km · {last.name}
          </p>
          {size !== "SMALL" && last.distanceMeters > 0 && last.movingSeconds > 0 && (
            <p className="text-sm text-ink-2">{pace(last.movingSeconds, last.distanceMeters)} /km</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-3">Henüz aktivite yok</p>
      )}
      <p className="text-sm text-ink-2">
        Bu hafta {km(data.weekDistanceMeters)} km · {data.weekActivities} aktivite
      </p>
    </div>
  );
}

function pace(seconds: number, meters: number): string {
  const perKm = seconds / (meters / 1000);
  const min = Math.floor(perKm / 60);
  const sec = Math.round(perKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

const FALLBACK_TEXT: Record<string, string> = {
  NOT_CONNECTED: "Hesap bağlantısı yok",
  NOT_CONFIGURED: "Bu kart henüz etkin değil",
  NOT_FOUND: "Hesap bulunamadı",
  UNAVAILABLE: "Şu an güncellenemedi",
};

/** Canli veri yoksa kart kaybolmaz; platform adi ve kullanici adiyla sade link gibi davranir. */
function Fallback({ card, status }: { card: Card; status: string }) {
  const platform = platformForType(card.type);
  return (
    <div className="mt-auto min-w-0">
      <p className="font-medium truncate">{platform.name}</p>
      <p className="text-sm text-ink-3 truncate">{card.config.username ? `@${card.config.username}` : FALLBACK_TEXT[status]}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-auto space-y-2 animate-pulse" aria-hidden="true">
      <div className="h-4 w-2/3 rounded bg-surface-2" />
      <div className="h-3 w-1/3 rounded bg-surface-2" />
    </div>
  );
}

function linkOf(card: Card, view: LiveView): string | null {
  const data = view.data as Record<string, unknown> | null;
  if (!data) return profileLink(card);
  if (card.type === "SPOTIFY" || card.type === "LASTFM") return (data.url as string) ?? (data.profileUrl as string) ?? null;
  if (card.type === "STRAVA") return (data.profileUrl as string) ?? null;
  return (data.url as string) ?? profileLink(card);
}

function profileLink(card: Card): string | null {
  const u = card.config.username;
  if (!u) return null;
  switch (card.type) {
    case "GITHUB":
      return `https://github.com/${u}`;
    case "REDDIT":
      return `https://www.reddit.com/user/${u}`;
    case "LASTFM":
      return `https://www.last.fm/user/${u}`;
    default:
      return null;
  }
}
