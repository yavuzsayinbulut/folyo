import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PostFeed } from "@/components/posts/PostFeed";
import { getMe, getPosts } from "@/lib/server-api";

export const metadata = { title: "Keşfet", description: "Doğrulanmış hesapların son paylaşımları." };

export default function ExplorePage() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <Explore />
    </Suspense>
  );
}

async function Explore() {
  const [me, page] = await Promise.all([getMe(), getPosts("/api/public/posts")]);
  return (
    <div className="flex-1">
      <AppHeader me={me} />
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Keşfet</h1>
        <p className="mb-5 text-sm text-ink-3">Doğrulanmış hesapların herkese açık son paylaşımları.</p>
        <PostFeed
          initial={page}
          source="/api/public/posts"
          signedIn={!!me}
          canPost={!!me?.profile}
          empty="Henüz paylaşım yok. İlk paylaşan sen ol."
        />
      </main>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-2xl animate-pulse px-4 py-20">
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-6 flex gap-3">
          <div className="size-10 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-surface-2" />
            <div className="h-4 w-full rounded bg-surface-2" />
            <div className="h-4 w-2/3 rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
