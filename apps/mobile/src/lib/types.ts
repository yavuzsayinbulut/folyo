import type { AccentKey, ThemeKey } from "./pageThemes";

// Web'deki src/lib/types.ts ile ayni sozlesme (API yanitlari). Su an iki kopya; ortak pakete tasimak ayri bir is.
export type CardType = "LINK" | "TEXT" | "GITHUB" | "REDDIT" | "LASTFM" | "SPOTIFY" | "STRAVA" | "GALLERY";
export type CardSize = "SMALL" | "WIDE" | "LARGE";
export type Visibility = "PUBLIC" | "UNLISTED";

export type Audience = "EVERYONE" | "SIGNED_IN" | "VERIFIED" | "ONLY_ME";
export type InteractionPolicy = "VERIFIED" | "APPROVAL" | "NOBODY";

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



// --- medya, gonderiler, sohbet (web'deki tiplerle ayni sozlesme) ---

export type Interaction = "ALLOWED" | "OWNER" | "SIGN_IN" | "VERIFY" | "BLOCKED" | "CLOSED";
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
  status: "VISIBLE" | "PENDING" | "HIDDEN";
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
export type BlockedUser = { userId: string; name: string; avatarUrl: string | null; username: string | null; blockedAt: string };

export type RealtimeEvent =
  | { type: "ready" }
  | { type: "pong" }
  | { type: "message"; conversationId: string; message: ChatMessage }
  | { type: "receipt"; conversationId: string; userId: string; deliveredSeq: number; readSeq: number | null }
  | { type: "typing"; conversationId: string; userId: string }
  | { type: "presence"; userId: string; online: boolean; lastSeenAt: string | null; hidden: boolean }
  | { type: "deleted"; conversationId: string; messageId: number };

/** Profil gorseli: avatarUrl herkesin gordugu (yuklenen > otomatik > giris hesabinin fotografi). */
export type AvatarStatus = {
  avatarUrl: string | null;
  uploadedUrl: string | null;
  auto: { url: string; source: "SPOTIFY" | "STRAVA" | "GENERATED"; platforms: string[] } | null;
  accountUrl: string | null;
};

export type ReportTarget = "POST" | "MESSAGE" | "PROFILE" | "GUESTBOOK";
export type ReportReason = "SPAM" | "HARASSMENT" | "HATE" | "SEXUAL" | "VIOLENCE" | "SELF_HARM" | "IMPERSONATION" | "ILLEGAL" | "OTHER";
