import type { AccentKey, ThemeKey } from "./themes";

export type CardType = "LINK" | "TEXT" | "GITHUB" | "REDDIT" | "LASTFM" | "SPOTIFY" | "STRAVA" | "GALLERY";
export type CardSize = "SMALL" | "WIDE" | "LARGE";
export type Visibility = "PUBLIC" | "UNLISTED";

export const LIVE_TYPES: CardType[] = ["GITHUB", "REDDIT", "LASTFM", "SPOTIFY", "STRAVA"];

export type MediaItem = { id: string; url: string; width: number | null; height: number | null };

export type Card = {
  id: string;
  type: CardType;
  size: CardSize;
  visible: boolean;
  config: { url?: string; title?: string; text?: string; username?: string };
  media?: MediaItem[] | null;
};

export type PublicPage = {
  username: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  timezone: string | null;
  status: string | null;
  avatarUrl: string | null;
  indexable: boolean;
  theme: ThemeKey;
  accent: AccentKey | null;
  cards: Card[];
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

export type GuestbookEntry = {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  status: "VISIBLE" | "HIDDEN";
  createdAt: string;
};

export type ConnectionInfo = {
  provider: "spotify" | "strava";
  configured: boolean;
  connected: boolean;
  externalUsername: string | null;
  status: "ACTIVE" | "REVOKED" | null;
};

export type ActivityEvent = {
  id: string;
  provider: "GITHUB" | "REDDIT" | "STRAVA";
  kind: string;
  title: string;
  url: string | null;
  occurredAt: string;
};

export type LiveStatus = "OK" | "STALE" | "NOT_CONNECTED" | "NOT_CONFIGURED" | "NOT_FOUND" | "UNAVAILABLE";

export type GitHubLive = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  url: string;
  followers: number;
  publicRepos: number;
  activeDays: number;
  contributionLevels: number[];
  topRepos: { name: string; url: string; stars: number; language: string | null }[];
};
export type RedditLive = { name: string; url: string; totalKarma: number; createdAt: string | null; iconUrl: string | null };
export type TrackLive = {
  source: "SPOTIFY" | "LASTFM";
  nowPlaying: boolean;
  title: string | null;
  artist: string | null;
  imageUrl: string | null;
  url: string | null;
  playedAt: string | null;
  profileUrl: string | null;
};
export type StravaLive = {
  athleteName: string | null;
  profileUrl: string;
  lastActivity: { name: string; sportType: string; distanceMeters: number; movingSeconds: number; startDate: string; url: string } | null;
  weekDistanceMeters: number;
  weekActivities: number;
};

export type LiveView = { type: CardType; status: LiveStatus; data: GitHubLive | RedditLive | TrackLive | StravaLive | null };

export type StatTotals = { views: number; visitors: number; clicks: number };
export type Stats = {
  days: number;
  series: { day: string; views: number; visitors: number }[];
  totals: StatTotals;
  previous: StatTotals;
  topCards: { cardId: string; type: CardType; size: CardSize; config: Card["config"]; clicks: number }[];
};
