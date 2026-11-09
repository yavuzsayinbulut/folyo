"use client";

import Link from "next/link";
import { useState } from "react";
import { IconCheck, IconHeart, IconHeartFilled, IconLock, IconMessageCircle, IconRosetteDiscountCheckFilled, IconTrash, IconUsers } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import { shortTime } from "@/lib/time";
import type { Post } from "@/lib/types";
import { Avatar } from "../Avatar";
import { useConfirm } from "../ConfirmDialog";
import { MediaGrid } from "../media/MediaGrid";
import { ReportButton } from "../moderation/ReportDialog";

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;

/** Metindeki baglantilar tiklanabilir; geri kalan duz metin olarak kalir (HTML yorumlanmaz). */
export function RichText({ text, linkClassName = "text-accent underline-offset-2 hover:underline" }: { text: string; linkClassName?: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className={linkClassName}>
            {part.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function PostCard({
  post,
  signedIn,
  onChange,
  onDelete,
  onApprove,
  linkToThread = true,
}: {
  post: Post;
  signedIn: boolean;
  onChange: (post: Post) => void;
  onDelete: (id: string) => void;
  /** Yalniz ust gonderinin sahibi, onay bekleyen yanitlari acar. */
  onApprove?: (post: Post) => void;
  linkToThread?: boolean;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [liking, setLiking] = useState(false);
  const { author } = post;
  const authorLink = author.username ? `/${author.username}` : null;
  const threadLink = `/p/${post.replyToId ?? post.id}`;

  async function toggleLike() {
    if (liking) return;
    setLiking(true);
    const optimistic = { ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) };
    onChange(optimistic);
    try {
      onChange(await api<Post>(`/api/me/posts/${post.id}/like`, { method: post.likedByMe ? "DELETE" : "POST" }));
    } catch (e) {
      onChange(post);
      setError(e instanceof ApiError ? e.message : "Olmadı, tekrar dene");
    } finally {
      setLiking(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: post.replyToId ? "Yanıt silinsin mi?" : "Gönderi silinsin mi?",
      body: post.media.length > 0 ? "Fotoğraf ve videolar da kalıcı olarak silinir." : undefined,
      confirmLabel: "Sil",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/me/posts/${post.id}`, { method: "DELETE" });
      onDelete(post.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Silinemedi, tekrar dene");
    }
  }

  const name = (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate font-medium">{author.displayName}</span>
      {author.verified && <IconRosetteDiscountCheckFilled size={16} className="shrink-0 text-accent" aria-label="Doğrulanmış hesap" />}
    </span>
  );

  return (
    <article className={`flex gap-3 px-4 py-4 ${post.status === "PENDING" ? "bg-surface-2/60" : ""}`}>
      {authorLink ? (
        <Link href={authorLink} className="shrink-0" aria-label={author.displayName}>
          <Avatar name={author.displayName} url={author.avatarUrl} size={42} />
        </Link>
      ) : (
        <Avatar name={author.displayName} url={author.avatarUrl} size={42} />
      )}
      <div className="min-w-0 flex-1">
        <header className="flex min-w-0 items-center gap-1.5 text-sm">
          {authorLink ? (
            <Link href={authorLink} className="min-w-0 hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
          {author.username && <span className="truncate text-ink-3">@{author.username}</span>}
          <span className="text-ink-3" aria-hidden="true">
            ·
          </span>
          {linkToThread ? (
            <Link href={threadLink} className="shrink-0 text-ink-3 hover:underline">
              <time dateTime={post.createdAt}>{shortTime(post.createdAt)}</time>
            </Link>
          ) : (
            <time dateTime={post.createdAt} className="shrink-0 text-ink-3">
              {shortTime(post.createdAt)}
            </time>
          )}
          {post.audience && post.audience !== "EVERYONE" && (
            <span className="inline-flex items-center gap-0.5 text-xs text-ink-3" title={post.audience === "VERIFIED" ? "Yalnız doğrulanmışlar görür" : "Yalnız giriş yapanlar görür"}>
              {post.audience === "VERIFIED" ? <IconLock size={13} aria-hidden="true" /> : <IconUsers size={13} aria-hidden="true" />}
              <span className="sr-only">{post.audience === "VERIFIED" ? "Yalnız doğrulanmışlar" : "Yalnız giriş yapanlar"}</span>
            </span>
          )}
        </header>
        {post.status === "PENDING" && <p className="mt-0.5 text-xs text-ink-3">Onay bekliyor · yalnız sen ve sayfa sahibi görüyor</p>}
        {post.status === "HIDDEN" && <p className="mt-0.5 text-xs text-danger">İnceleniyor · şikayetler nedeniyle şimdilik gizlendi</p>}
        {post.body && (
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            <RichText text={post.body} />
          </p>
        )}
        {post.media.length > 0 && (
          <div className="mt-3">
            <MediaGrid media={post.media} />
          </div>
        )}
        <footer className="mt-2 flex items-center gap-5 text-sm text-ink-3">
          {!post.replyToId &&
            (linkToThread ? (
              <Link href={threadLink} className="inline-flex items-center gap-1.5 hover:text-accent" aria-label={`${post.replyCount} yanıt`}>
                <IconMessageCircle size={18} aria-hidden="true" />
                {post.replyCount > 0 && <span className="tabular-nums">{post.replyCount}</span>}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5" aria-label={`${post.replyCount} yanıt`}>
                <IconMessageCircle size={18} aria-hidden="true" />
                {post.replyCount > 0 && <span className="tabular-nums">{post.replyCount}</span>}
              </span>
            ))}
          {post.status === "VISIBLE" &&
            (signedIn ? (
              <button
                onClick={toggleLike}
                aria-pressed={post.likedByMe}
                aria-label={post.likedByMe ? "Beğeniyi geri al" : "Beğen"}
                className={`inline-flex items-center gap-1.5 ${post.likedByMe ? "text-rose-500" : "hover:text-rose-500"}`}
              >
                {post.likedByMe ? <IconHeartFilled size={18} aria-hidden="true" /> : <IconHeart size={18} aria-hidden="true" />}
                {post.likeCount > 0 && <span className="tabular-nums">{post.likeCount}</span>}
              </button>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(threadLink)}`} className="inline-flex items-center gap-1.5 hover:text-rose-500" aria-label="Beğenmek için giriş yap">
                <IconHeart size={18} aria-hidden="true" />
                {post.likeCount > 0 && <span className="tabular-nums">{post.likeCount}</span>}
              </Link>
            ))}
          {onApprove && post.status === "PENDING" && (
            <button onClick={() => onApprove(post)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-ok-ink hover:bg-ok-soft">
              <IconCheck size={16} aria-hidden="true" /> Onayla
            </button>
          )}
          {signedIn && !post.mine && post.status === "VISIBLE" && (
            <ReportButton
              target="POST"
              targetId={post.id}
              title={post.replyToId ? "Yanıtı şikayet et" : "Gönderiyi şikayet et"}
              className="ml-auto rounded-lg p-1 hover:text-danger"
            />
          )}
          {post.canDelete && (
            <button onClick={remove} aria-label="Sil" className={`${signedIn && !post.mine && post.status === "VISIBLE" ? "" : "ml-auto "}inline-flex items-center gap-1 rounded-lg p-1 hover:text-danger`}>
              <IconTrash size={17} aria-hidden="true" />
            </button>
          )}
        </footer>
        {error && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      {confirmDialog}
    </article>
  );
}
