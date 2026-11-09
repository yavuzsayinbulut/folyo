import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PostFeed } from "@/components/posts/PostFeed";
import { getMe, getPosts } from "@/lib/server-api";

export const metadata = { title: "Keşfet", description: "Doğrulanmış hesapların son paylaşımları." };

/** "Senin için": etkileşim, tazelik ve yakınlığa göre sıralı. "En yeni": yeniden eskiye. */
const FEEDS = {
  "senin-icin": { label: "Senin için", source: "/api/public/posts/for-you" },
  yeni: { label: "En yeni", source: "/api/public/posts" },
} as const;
type FeedKey = keyof typeof FEEDS;

export default function ExplorePage({ searchParams }: PageProps<"/kesfet">) {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <Explore searchParams={searchParams} />
    </Suspense>
  );
}

async function Explore({ searchParams }: { searchParams: PageProps<"/kesfet">["searchParams"] }) {
  const { akis } = await searchParams;
  const feed: FeedKey = akis === "yeni" ? "yeni" : "senin-icin";
  const { source } = FEEDS[feed];
  const [me, page] = await Promise.all([getMe(), getPosts(source)]);
  return (
    <div className="flex-1">
      <AppHeader me={me} />
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">Keşfet</h1>
        <p className="mb-4 text-sm text-ink-3">Doğrulanmış hesapların herkese açık paylaşımları.</p>
        <nav aria-label="Akış" className="mb-5 inline-flex rounded-xl border border-line-strong p-0.5">
          {(Object.keys(FEEDS) as FeedKey[]).map((key) => (
            <Link
              key={key}
              href={key === "senin-icin" ? "/kesfet" : "/kesfet?akis=yeni"}
              aria-current={feed === key ? "page" : undefined}
              className={`h-8 rounded-[10px] px-3 text-sm leading-8 ${feed === key ? "bg-accent font-medium text-on-accent" : "text-ink-2 hover:text-ink"}`}
            >
              {FEEDS[key].label}
            </Link>
          ))}
        </nav>
        <PostFeed
          key={feed}
          initial={page}
          source={source}
          signedIn={!!me}
          canPost={!!me?.profile}
          empty="Henüz paylaşım yok. İlk paylaşan sen ol."
          end={feed === "senin-icin" ? "Şimdilik bu kadar. Daha eskiler için En yeni akışına bak." : undefined}
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
