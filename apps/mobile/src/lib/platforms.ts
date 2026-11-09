import {
  IconAlignLeft,
  IconAperture,
  IconBrandBehance,
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLastfm,
  IconBrandLinkedin,
  IconBrandMedium,
  IconBrandReddit,
  IconBrandSpotify,
  IconBrandStrava,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconPhoto,
  IconWorld,
} from "@tabler/icons-react-native";
import type { Tone } from "./theme";
import type { Card } from "./types";

type Icon = typeof IconWorld;
export type Platform = { name: string; icon: Icon; tone: Tone };

const HOSTS: [string[], Platform][] = [
  [["instagram.com"], { name: "Instagram", icon: IconBrandInstagram, tone: "pink" }],
  [["x.com", "twitter.com"], { name: "X", icon: IconBrandX, tone: "gray" }],
  [["linkedin.com"], { name: "LinkedIn", icon: IconBrandLinkedin, tone: "blue" }],
  [["github.com"], { name: "GitHub", icon: IconBrandGithub, tone: "gray" }],
  [["open.spotify.com", "spotify.com"], { name: "Spotify", icon: IconBrandSpotify, tone: "green" }],
  [["vsco.co"], { name: "VSCO", icon: IconAperture, tone: "gray" }],
  [["reddit.com"], { name: "Reddit", icon: IconBrandReddit, tone: "coral" }],
  [["facebook.com"], { name: "Facebook", icon: IconBrandFacebook, tone: "blue" }],
  [["youtube.com", "youtu.be"], { name: "YouTube", icon: IconBrandYoutube, tone: "red" }],
  [["tiktok.com"], { name: "TikTok", icon: IconBrandTiktok, tone: "gray" }],
  [["strava.com"], { name: "Strava", icon: IconBrandStrava, tone: "amber" }],
  [["medium.com"], { name: "Medium", icon: IconBrandMedium, tone: "gray" }],
  [["behance.net"], { name: "Behance", icon: IconBrandBehance, tone: "blue" }],
];

const WEB: Platform = { name: "Web", icon: IconWorld, tone: "purple" };

function host(url?: string): string | null {
  const match = url?.match(/^https?:\/\/([^/?#]+)/i);
  return match ? match[1].replace(/^www\./, "").toLowerCase() : null;
}

/** Web'deki platformFor ile ayni kural: alan adindan platform. */
export function platformForUrl(url?: string): Platform {
  const h = host(url);
  if (!h) return WEB;
  for (const [hosts, platform] of HOSTS) {
    if (hosts.some((x) => h === x || h.endsWith(`.${x}`))) return platform;
  }
  return WEB;
}

export const TYPE_PLATFORM: Record<Exclude<Card["type"], "LINK">, Platform> = {
  TEXT: { name: "Metin", icon: IconAlignLeft, tone: "gray" },
  GITHUB: { name: "GitHub", icon: IconBrandGithub, tone: "gray" },
  REDDIT: { name: "Reddit", icon: IconBrandReddit, tone: "coral" },
  LASTFM: { name: "Last.fm", icon: IconBrandLastfm, tone: "red" },
  SPOTIFY: { name: "Spotify", icon: IconBrandSpotify, tone: "green" },
  STRAVA: { name: "Strava", icon: IconBrandStrava, tone: "amber" },
  GALLERY: { name: "Galeri", icon: IconPhoto, tone: "pink" },
};

export function describeCard(card: Pick<Card, "type" | "config" | "media">): { platform: Platform; title: string; subtitle: string } {
  if (card.type === "LINK") {
    const platform = platformForUrl(card.config.url);
    const address = card.config.url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") ?? "";
    return { platform, title: card.config.title || platform.name, subtitle: address };
  }
  const platform = TYPE_PLATFORM[card.type];
  if (card.type === "TEXT") return { platform, title: card.config.text ?? "", subtitle: "Metin" };
  if (card.type === "GALLERY") return { platform, title: card.config.title || "Galeri", subtitle: `${card.media?.length ?? 0} fotoğraf` };
  return { platform, title: platform.name, subtitle: card.config.username ? `@${card.config.username} · canlı` : "Canlı · bağlı hesap" };
}
