import type { AccentKey, ThemeKey } from "./pageThemes";

// Web'deki src/lib/types.ts ile ayni sozlesme (API yanitlari). Su an iki kopya; ortak pakete tasimak ayri bir is.
export type CardType = "LINK" | "TEXT" | "GITHUB" | "REDDIT" | "LASTFM" | "SPOTIFY" | "STRAVA" | "GALLERY";
export type CardSize = "SMALL" | "WIDE" | "LARGE";
export type Visibility = "PUBLIC" | "UNLISTED";

export type MediaItem = { id: string; url: string; width: number | null; height: number | null };

export type Card = {
  id: string;
  type: CardType;
  size: CardSize;
  visible: boolean;
  config: { url?: string; title?: string; text?: string; username?: string };
  media?: MediaItem[] | null;
};

export type Profile = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  timezone: string | null;
  status: string | null;
  visibility: Visibility;
  theme: ThemeKey;
  accent: AccentKey | null;
};

export type Me = {
  user: { id: string; name: string; email: string | null; avatarUrl: string | null };
  profile: Profile | null;
};

export type StatTotals = { views: number; visitors: number; clicks: number };
export type Stats = {
  days: number;
  series: { day: string; views: number; visitors: number }[];
  totals: StatTotals;
  previous: StatTotals;
  topCards: { cardId: string; type: CardType; size: CardSize; config: Card["config"]; clicks: number }[];
};
