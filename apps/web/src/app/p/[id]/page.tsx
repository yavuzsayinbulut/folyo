import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PostThreadView } from "@/components/posts/PostThreadView";
import { getMe, getPostThread } from "@/lib/server-api";

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const { id } = await params;
  // Baglanti onizlemesine yalniz herkese acik gonderinin metni duser.
  const thread = await getPostThread(id, false).catch(() => null);
  if (!thread) return { title: "Gönderi", robots: { index: false, follow: false } };
  const text = thread.post.body?.slice(0, 160) ?? "Fotoğraf";
  return {
    title: `${thread.post.author.displayName}: ${text.slice(0, 60)}`,
    description: text,
    openGraph: { title: thread.post.author.displayName, description: text, type: "article" },
  };
}

export default function PostPage({ params }: PageProps<"/p/[id]">) {
  return (
    <Suspense fallback={<p className="p-8 text-ink-3">Yükleniyor…</p>}>
      <Thread params={params} />
    </Suspense>
  );
}

async function Thread({ params }: { params: PageProps<"/p/[id]">["params"] }) {
  const { id } = await params;
  const [me, thread] = await Promise.all([getMe(), getPostThread(id)]);
  if (!thread) notFound();
  return (
    <div className="flex-1">
      <AppHeader me={me} />
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <PostThreadView initial={thread} signedIn={!!me} />
      </main>
    </div>
  );
}
