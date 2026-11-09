import type { AccentKey, ThemeKey } from "./themes";

export type CardType = "LINK" | "TEXT" | "GITHUB" | "REDDIT" | "LASTFM" | "SPOTIFY" | "STRAVA" | "GALLERY";
export type CardSize = "SMALL" | "WIDE" | "LARGE";
export type Visibility = "PUBLIC" | "UNLISTED";

/** Kim gorebilir. Sahip her zaman her seyi gorur. */
export type Audience = "EVERYONE" | "SIGNED_IN" | "VERIFIED" | "ONLY_ME";
/** Kim yazabilir (her durumda dogrulanmis olmak gerekir). APPROVAL: defter onaya, mesaj isteklere duser. */
export type InteractionPolicy = "VERIFIED" | "APPROVAL" | "NOBODY";
/** Ziyaretcinin bu sayfaya yazip yazamayacagi ve yazamiyorsa nedeni. */
export type Interaction = "ALLOWED" | "OWNER" | "SIGN_IN" | "VERIFY" | "BLOCKED" | "CLOSED";

export type Privacy = {
  indexable: boolean;
  profile: Audience;
  location: Audience;
  localTime: Audience;
  activity: Audience;
  guestbook: Audience;
  comments: InteractionPolicy;
  messages: InteractionPolicy;
};

export const LIVE_TYPES: CardType[] = ["GITHUB", "REDDIT", "LASTFM", "SPOTIFY", "STRAVA"];

export type MediaItem = { id: string; url: string; width: number | null; height: number | null };

export type Card = {
  id: string;
  type: CardType;
  size: CardSize;
  visible: boolean;
  audience: Exclude<Audience, "ONLY_ME">;
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
  interactions: {
    comment: Interaction;
    commentNeedsApproval: boolean;
    message: Interaction;
    guestbookVisible: boolean;
    activityVisible: boolean;
  };
};

/** Sayfa yalniz giris yapanlara ya da dogrulanmislara acik: kim oldugu degil, ne gerektigi gelir. */
export type RestrictedPage = { username: string; requirement: "SIGNED_IN" | "VERIFIED" };

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
  privacy: Privacy;
};

export type Me = {
  user: { id: string; name: string; email: string | null; avatarUrl: string | null; admin: boolean; verified: boolean };
  profile: Profile | null;
};

export type GuestbookEntry = {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  status: "VISIBLE" | "HIDDEN" | "PENDING";
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

export type VerificationStatus = {
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  requireEmail: boolean;
  requirePhone: boolean;
  verified: boolean;
  emailAvailable: boolean;
  phoneAvailable: boolean;
};

export type BlockedUser = { userId: string; name: string; avatarUrl: string | null; username: string | null; blockedAt: string };

export type SmsProvider = "OFF" | "LOG" | "TWILIO" | "NETGSM";
export type EmailProvider = "OFF" | "LOG" | "SMTP";
export type StorageProvider = "LOCAL" | "S3";
export type VerificationPolicy = { requireEmail: boolean; requirePhone: boolean; phoneCountries: string[] | null; smsDailyLimit: number | null };

export type AdminSettings = {
  sms: {
    provider: SmsProvider;
    twilio: { accountSid: string | null; from: string | null; authTokenSet: boolean } | null;
    netgsm: { usercode: string | null; header: string | null; passwordSet: boolean } | null;
  };
  email: {
    provider: EmailProvider;
    smtp: { host: string | null; port: number; username: string | null; from: string | null; startTls: boolean; passwordSet: boolean } | null;
  };
  storage: {
    provider: StorageProvider;
    s3: { endpoint: string | null; region: string | null; bucket: string | null; accessKey: string | null; pathStyle: boolean; secretKeySet: boolean } | null;
  };
  policy: VerificationPolicy;
  allowLog: boolean;
  warnings: string[];
};

// --- medya, gonderiler, sohbet ---

export type AssetKind = "PHOTO" | "VIDEO" | "AVATAR" | "STICKER";

/** url: orijinal kalite; thumbUrl/largeUrl: listelerde hizli acilan kopyalar; posterUrl: video kapagi. */
export type Asset = {
  id: string;
  kind: AssetKind;
  contentType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
  thumbUrl: string;
  largeUrl: string;
  posterUrl: string | null;
};

export type PostAudience = Exclude<Audience, "ONLY_ME">;

export type Post = {
  id: string;
  replyToId: string | null;
  author: { username: string | null; displayName: string; avatarUrl: string | null; verified: boolean };
  body: string | null;
  media: Asset[];
  audience: PostAudience | null;
  status: "VISIBLE" | "PENDING";
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  mine: boolean;
  canDelete: boolean;
  createdAt: string;
};

export type PostPage = { posts: Post[]; next: string | null };
export type PostThread = { post: Post; replies: Post[]; replyInteraction: Interaction; repliesNeedApproval: boolean };

export type ChatFolder = "CHATS" | "REQUESTS" | "ARCHIVE";
export type MemberState = "ACTIVE" | "REQUEST" | "ARCHIVED";
export type MessageKind = "TEXT" | "PHOTO" | "VIDEO" | "STICKER";
export type LastSeenAudience = "EVERYONE" | "CHATS" | "NOBODY";

export type ChatMessage = {
  id: number;
  seq: number;
  senderId: string;
  mine: boolean;
  kind: MessageKind;
  body: string | null;
  sticker: string | null;
  stickerUrl: string | null;
  asset: Asset | null;
  createdAt: string;
  deleted: boolean;
};

/** presence null: karsi taraf son gorulmesini gizledi (ya da sen gizledin). otherReadSeq null: okundu bilgisi kapali. */
export type Conversation = {
  id: string;
  other: { userId: string; name: string; username: string | null; avatarUrl: string | null };
  state: MemberState;
  unread: number;
  lastMessage: ChatMessage | null;
  lastMessageAt: string | null;
  otherDeliveredSeq: number;
  otherReadSeq: number | null;
  presence: { online: boolean; lastSeenAt: string | null } | null;
  startedByMe: boolean;
};

export type ChatThread = { conversation: Conversation; messages: ChatMessage[]; nextBefore: number | null };
export type ChatUnread = { chats: number; requests: number };
export type ChatSettings = { lastSeenAudience: LastSeenAudience; readReceipts: boolean };
export type StickerPack = { id: string; name: string; stickers: { id: string; title: string; url: string }[] };
export type StickerSet = { packs: StickerPack[]; mine: Asset[] };

/** Sunucudan anlik gelen olaylar. */
export type RealtimeEvent =
  | { type: "ready" }
  | { type: "pong" }
  | { type: "message"; conversationId: string; message: ChatMessage }
  | { type: "receipt"; conversationId: string; userId: string; deliveredSeq: number; readSeq: number | null }
  | { type: "typing"; conversationId: string; userId: string }
  | { type: "presence"; userId: string; online: boolean; lastSeenAt: string | null; hidden: boolean }
  | { type: "deleted"; conversationId: string; messageId: number };
