"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import type { Post, PostThread } from "@/lib/types";
import { InteractionNotice } from "../InteractionNotice";
import { Composer } from "./Composer";
import { PostCard } from "./PostCard";

/** Gonderi ve yanitlari. Yanit kurali sayfa sahibinin yorum ayarindan gelir; onayli yanitlari sahibi acar. */
export function PostThreadView({ initial, signedIn }: { initial: PostThread; signedIn: boolean }) {
  const router = useRouter();
  const [post, setPost] = useState(initial.post);
  const [replies, setReplies] = useState(initial.replies);
  const [error, setError] = useState<string | null>(null);
  const interaction = initial.replyInteraction;
  const username = post.author.username ?? "";

  async function approve(reply: Post) {
    try {
      const approved = await api<Post>(`/api/me/posts/${reply.id}/approve`, { method: "POST" });
      setReplies((list) => list.map((r) => (r.id === approved.id ? approved : r)));
      setPost((p) => ({ ...p, replyCount: p.replyCount + 1 }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Onaylanamadı, tekrar dene");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <PostCard
          post={post}
          signedIn={signedIn}
          linkToThread={false}
          onChange={setPost}
          onDelete={() => router.push(username ? `/${username}` : "/kesfet")}
        />
      </div>

      {interaction === "ALLOWED" || interaction === "OWNER" ? (
        <>
          <Composer
            replyToId={post.id}
            placeholder={interaction === "OWNER" ? "Yanıtla" : `${post.author.displayName} kişisine yanıt yaz`}
            onPosted={(reply) => {
              setReplies((list) => [...list, reply]);
              if (reply.status === "VISIBLE") setPost((p) => ({ ...p, replyCount: p.replyCount + 1 }));
            }}
          />
          {initial.repliesNeedApproval && interaction === "ALLOWED" && (
            <p className="-mt-2 text-xs text-ink-3">Yanıtın sayfa sahibi onaylayınca herkese görünür.</p>
          )}
        </>
      ) : (
        <InteractionNotice interaction={interaction} username={username} action="Yanıt yazmak" next={`/p/${post.id}`} />
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {replies.length > 0 && (
        <section aria-label="Yanıtlar" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {replies.map((reply) => (
            <PostCard
              key={reply.id}
              post={reply}
              signedIn={signedIn}
              linkToThread={false}
              onChange={(next) => setReplies((list) => list.map((r) => (r.id === next.id ? next : r)))}
              onDelete={(id) => {
                setReplies((list) => list.filter((r) => r.id !== id));
                if (reply.status === "VISIBLE") setPost((p) => ({ ...p, replyCount: Math.max(0, p.replyCount - 1) }));
              }}
              onApprove={post.mine ? approve : undefined}
            />
          ))}
        </section>
      )}
    </div>
  );
}
