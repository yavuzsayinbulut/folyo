import {
  IconAperture,
  IconBook,
  IconBrandBehance,
  IconBrandBluesky,
  IconBrandDiscord,
  IconBrandDribbble,
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandGitlab,
  IconBrandInstagram,
  IconBrandLastfm,
  IconBrandLetterboxd,
  IconBrandLinkedin,
  IconBrandMastodon,
  IconBrandMedium,
  IconBrandPinterest,
  IconBrandReddit,
  IconBrandSoundcloud,
  IconBrandSpotify,
  IconBrandStackoverflow,
  IconBrandStrava,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandTwitch,
  IconBrandX,
  IconBrandYoutube,
  IconPhoto,
  IconWorld,
  type Icon,
} from "@tabler/icons-react";

export type Tone = "gray" | "green" | "pink" | "blue" | "coral" | "amber" | "purple" | "teal" | "red";

export type Platform = { key: string; name: string; icon: Icon; tone: Tone };

/** Linkin alan adindan platformu tanir. Sunucu yalniz URL saklar; gosterim karari burada verilir. */
const PLATFORMS: { hosts: string[]; platform: Platform }[] = [
  { hosts: ["instagram.com"], platform: { key: "instagram", name: "Instagram", icon: IconBrandInstagram, tone: "pink" } },
  { hosts: ["x.com", "twitter.com"], platform: { key: "x", name: "X", icon: IconBrandX, tone: "gray" } },
  { hosts: ["linkedin.com"], platform: { key: "linkedin", name: "LinkedIn", icon: IconBrandLinkedin, tone: "blue" } },
  { hosts: ["github.com"], platform: { key: "github", name: "GitHub", icon: IconBrandGithub, tone: "gray" } },
  { hosts: ["gitlab.com"], platform: { key: "gitlab", name: "GitLab", icon: IconBrandGitlab, tone: "coral" } },
  { hosts: ["open.spotify.com", "spotify.com"], platform: { key: "spotify", name: "Spotify", icon: IconBrandSpotify, tone: "green" } },
  { hosts: ["vsco.co"], platform: { key: "vsco", name: "VSCO", icon: IconAperture, tone: "gray" } },
  { hosts: ["reddit.com"], platform: { key: "reddit", name: "Reddit", icon: IconBrandReddit, tone: "coral" } },
  { hosts: ["facebook.com", "fb.com"], platform: { key: "facebook", name: "Facebook", icon: IconBrandFacebook, tone: "blue" } },
  { hosts: ["youtube.com", "youtu.be"], platform: { key: "youtube", name: "YouTube", icon: IconBrandYoutube, tone: "red" } },
  { hosts: ["tiktok.com"], platform: { key: "tiktok", name: "TikTok", icon: IconBrandTiktok, tone: "gray" } },
  { hosts: ["strava.com"], platform: { key: "strava", name: "Strava", icon: IconBrandStrava, tone: "amber" } },
  { hosts: ["medium.com"], platform: { key: "medium", name: "Medium", icon: IconBrandMedium, tone: "gray" } },
  { hosts: ["substack.com"], platform: { key: "substack", name: "Substack", icon: IconBook, tone: "amber" } },
  { hosts: ["behance.net"], platform: { key: "behance", name: "Behance", icon: IconBrandBehance, tone: "blue" } },
  { hosts: ["dribbble.com"], platform: { key: "dribbble", name: "Dribbble", icon: IconBrandDribbble, tone: "pink" } },
  { hosts: ["twitch.tv"], platform: { key: "twitch", name: "Twitch", icon: IconBrandTwitch, tone: "purple" } },
  { hosts: ["bsky.app"], platform: { key: "bluesky", name: "Bluesky", icon: IconBrandBluesky, tone: "blue" } },
  { hosts: ["threads.net", "threads.com"], platform: { key: "threads", name: "Threads", icon: IconBrandThreads, tone: "gray" } },
  { hosts: ["discord.gg", "discord.com"], platform: { key: "discord", name: "Discord", icon: IconBrandDiscord, tone: "purple" } },
  { hosts: ["mastodon.social"], platform: { key: "mastodon", name: "Mastodon", icon: IconBrandMastodon, tone: "purple" } },
  { hosts: ["pinterest.com"], platform: { key: "pinterest", name: "Pinterest", icon: IconBrandPinterest, tone: "red" } },
  { hosts: ["soundcloud.com"], platform: { key: "soundcloud", name: "SoundCloud", icon: IconBrandSoundcloud, tone: "coral" } },
  { hosts: ["stackoverflow.com"], platform: { key: "stackoverflow", name: "Stack Overflow", icon: IconBrandStackoverflow, tone: "amber" } },
  { hosts: ["letterboxd.com", "boxd.it"], platform: { key: "letterboxd", name: "Letterboxd", icon: IconBrandLetterboxd, tone: "teal" } },
];

const WEB: Platform = { key: "web", name: "Web", icon: IconWorld, tone: "purple" };

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function platformFor(url: string | undefined): Platform {
  const host = url ? hostOf(url) : null;
  if (!host) return WEB;
  for (const { hosts, platform } of PLATFORMS) {
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return platform;
  }
  return WEB;
}

/** "https://github.com/ada/" -> "github.com/ada" gibi okunur kisa adres. */
export function displayAddress(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

/** linkedin.com/in/x, reddit.com/user/x gibi adreslerde kullanici adi ikinci parcadadir. */
const PROFILE_PREFIXES = new Set(["in", "user", "u", "users", "company", "channel", "c", "profile", "people"]);

/** Profil URL'lerinden kullanici adini cikarir: instagram.com/ada -> @ada, linkedin.com/in/ada -> @ada. */
export function handleOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const segment = PROFILE_PREFIXES.has(segments[0]?.toLowerCase()) ? segments[1] : segments[0];
    if (!segment || segment.length > 40) return null;
    return segment.startsWith("@") ? segment : `@${segment}`;
  } catch {
    return null;
  }
}

/** Canli ve galeri kart tiplerinin ikon/ton karsiligi. */
export function platformForType(type: string): Platform {
  switch (type) {
    case "GITHUB":
      return platformFor("https://github.com");
    case "REDDIT":
      return platformFor("https://reddit.com");
    case "SPOTIFY":
      return platformFor("https://open.spotify.com");
    case "STRAVA":
      return platformFor("https://strava.com");
    case "LASTFM":
      return { key: "lastfm", name: "Last.fm", icon: IconBrandLastfm, tone: "red" };
    case "GALLERY":
      return { key: "gallery", name: "Galeri", icon: IconPhoto, tone: "pink" };
    default:
      return WEB;
  }
}
