"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import type { Post, PostPage } from "@/lib/types";
import { Composer } from "./Composer";
import { PostCard } from "./PostCard";

/**
 * Gonderi akisi: ilk sayfa sunucudan gelir, devami imlecle yuklenir. Yeni paylasilan gonderi en uste eklenir.
 */
export function PostFeed({
  initial,
  source,
  signedIn,
  canPost,
  empty,
  end,
}: {
  initial: PostPage;
  /** Devam sayfalari icin API yolu (ornegin /api/public/posts). */
  source: string;
  signedIn: boolean;
  canPost: boolean;
  empty: string;
  /** Akisin sonuna gelindiginde gosterilecek not. */
  end?: string;
}) {
  const [posts, setPosts] = useState(initial.posts);
  const [next, setNext] = useState(initial.next);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function more() {
    if (!next) return;
    setLoading(true);
    setFailed(false);
    try {
      const page = await api<PostPage>(`${source}?cursor=${encodeURIComponent(next)}`);
      // Arada yeni paylasim olduysa ayni gonderi iki kez gorunmesin.
      setPosts((list) => [...list, ...page.posts.filter((p) => !list.some((o) => o.id === p.id))]);
      setNext(page.next);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const replace = (post: Post) => setPosts((list) => list.map((p) => (p.id === post.id ? post : p)));
  const remove = (id: string) => setPosts((list) => list.filter((p) => p.id !== id));

  return (
    <div className="flex flex-col gap-4">
      {canPost && <Composer onPosted={(post) => setPosts((list) => [post, ...list])} />}
      {posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-3">{empty}</p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} signedIn={signedIn} onChange={replace} onDelete={remove} />
          ))}
        </div>
      )}
      {!next && end && posts.length > 0 && <p className="text-center text-sm text-ink-3">{end}</p>}
      {next && (
        <button onClick={more} disabled={loading} className="mx-auto h-10 rounded-xl border border-line-strong px-4 text-sm hover:bg-surface-2 disabled:opacity-60">
          {loading ? "Yükleniyor…" : failed ? "Yüklenemedi, tekrar dene" : "Daha fazla göster"}
        </button>
      )}
    </div>
  );
}
