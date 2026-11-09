import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IconClock, IconMapPin } from "@tabler/icons-react";
import { IconLock } from "@tabler/icons-react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Avatar } from "@/components/Avatar";
import { BentoGrid } from "@/components/CardTile";
import { ContactBox } from "@/components/ContactBox";
import { Guestbook } from "@/components/Guestbook";
import { LocalTime } from "@/components/LocalTime";
import { ReportButton } from "@/components/moderation/ReportDialog";
import { PostFeed } from "@/components/posts/PostFeed";
import { VisitTracker } from "@/components/VisitTracker";
import { getActivity, getGuestbook, getMe, getPosts, getPublicPage } from "@/lib/server-api";
import { platformFor } from "@/lib/platforms";
import { themeProps } from "@/lib/themes";

export async function generateMetadata({ params }: PageProps<"/[username]">): Promise<Metadata> {
  const { username } = await params;
  // Metadata once anonim bakisla uretilir: gizli sayfanin adi/biyografisi baglanti onizlemesine sizmaz.
  // Anonim bakis bulamazsa ("yalniz ben" sayfasi) oturumdaki kisiyle tekrar sorulur; sahibi kendi sayfasini acabilir.
  // Cerezsiz bot ve onizleyiciler icin olmayan sayfa yine akistan once 404 doner.
  const result = (await getPublicPage(username, false)) ?? (await getPublicPage(username, true));
  if (!result) notFound();
  if (result.kind === "restricted") return { title: "Gizli sayfa", robots: { index: false, follow: false } };
  const page = result.page;
  const description = page.bio ?? `${page.displayName} folyo sayfası`;
  return {
    title: page.displayName,
    description,
    robots: page.indexable ? undefined : { index: false, follow: false },
    openGraph: { title: `${page.displayName} · folyo`, description, url: `/${page.username}`, type: "profile" },
    twitter: { card: "summary_large_image", title: `${page.displayName} · folyo`, description },
  };
}

export default function ProfilePage({ params }: PageProps<"/[username]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <Profile params={params} />
    </Suspense>
  );
}

const MAIN = "mx-auto w-full max-w-3xl px-4 py-10 sm:py-14";

async function Profile({ params }: { params: PageProps<"/[username]">["params"] }) {
  const { username } = await params;
  const result = await getPublicPage(username, true);
  if (!result) notFound();
  if (result.kind === "restricted") return <RestrictedNotice username={result.restricted.username} requirement={result.restricted.requirement} />;
  const page = result.page;
  const { interactions } = page;
  const postsPath = `/api/public/profiles/${encodeURIComponent(page.username)}/posts`;
  const [entries, activity, posts, me] = await Promise.all([
    interactions.guestbookVisible ? getGuestbook(username) : Promise.resolve([]),
    interactions.activityVisible ? getActivity(username) : Promise.resolve([]),
    getPosts(postsPath),
    getMe(),
  ]);
  const owner = interactions.message === "OWNER";

  // Ust siradaki ikon satiri: link kartlarindan taninan platformlar (tekrarsiz).
  const socials = page.cards
    .filter((c) => c.type === "LINK")
    .map((c) => ({ id: c.id, url: c.config.url!, platform: platformFor(c.config.url) }))
    .filter((s, i, all) => s.platform.key !== "web" && all.findIndex((o) => o.platform.key === s.platform.key) === i)
    .slice(0, 8);

  // Tema butun sayfayi (arka plan dahil) kaplar; secilen sablonun renkleri, yazi tipi ve koseleri buradan gelir.
  return (
    <div className="theme-root flex-1" {...themeProps(page.theme, page.accent)}>
      <main className={MAIN}>
        <VisitTracker username={page.username} />
        <header className="mb-6 flex flex-col gap-5 rounded-[calc(var(--card-radius)+8px)] border border-line bg-surface p-6 sm:flex-row sm:items-center">
          <div className="shrink-0 rounded-full p-1 ring-1 ring-line-strong">
            <Avatar name={page.displayName} url={page.avatarUrl} size={84} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-[1.7rem] font-semibold leading-tight tracking-tight">{page.displayName}</h1>
              {page.status && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft text-ok-ink text-xs px-2.5 py-1">
                  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                  {page.status}
                </span>
              )}
            </div>
            {page.bio && <p className="mt-1.5 text-ink-2 leading-relaxed">{page.bio}</p>}
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
              <span>folyo.app/{page.username}</span>
              {page.location && (
                <span className="inline-flex items-center gap-1">
                  <IconMapPin size={15} aria-hidden="true" />
                  {page.location}
                </span>
              )}
              {page.timezone && (
                <span className="inline-flex items-center gap-1">
                  <IconClock size={15} aria-hidden="true" />
                  <LocalTime timezone={page.timezone} />
                </span>
              )}
            </p>
          </div>
        </header>

        {socials.length > 0 && (
          <nav aria-label="Hesaplar" className="flex flex-wrap gap-2 mb-6">
            {socials.map(({ id, url, platform }) => {
              const Icon = platform.icon;
              return (
                <a
                  key={platform.key}
                  href={url}
                  data-card-id={id}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={platform.name}
                  className={`tone-${platform.tone} inline-flex size-10 items-center justify-center rounded-xl`}
                  style={{ background: "var(--tone-bg)", color: "var(--tone-ink)" }}
                >
                  <Icon size={20} aria-hidden="true" />
                </a>
              );
            })}
          </nav>
        )}

        {page.cards.length > 0 ? (
          <BentoGrid cards={page.cards} />
        ) : (
          <p className="rounded-[var(--card-radius)] border border-dashed border-line-strong p-8 text-center text-ink-3">Bu sayfa henüz boş.</p>
        )}

        <div className="mt-8 flex flex-col gap-8">
          {(posts.posts.length > 0 || owner) && (
            <section aria-labelledby="posts">
              <h2 id="posts" className="mb-3 font-medium">
                Gönderiler
              </h2>
              <PostFeed
                initial={posts}
                source={postsPath}
                signedIn={!!me}
                canPost={owner}
                empty="Henüz bir şey paylaşmadın. Paylaştıkların burada ve Keşfet'te görünür."
              />
            </section>
          )}
          {interactions.message !== "CLOSED" && interactions.message !== "OWNER" && (
            <ContactBox username={page.username} displayName={page.displayName} interaction={interactions.message} />
          )}
          {interactions.activityVisible && <ActivityFeed events={activity} />}
          {(interactions.guestbookVisible || interactions.comment !== "CLOSED") && (
            <Guestbook
              username={page.username}
              initialEntries={entries}
              entriesVisible={interactions.guestbookVisible}
              interaction={interactions.comment}
              needsApproval={interactions.commentNeedsApproval}
            />
          )}
        </div>

        <footer className="mt-10 flex flex-col items-center gap-2 text-sm text-ink-3">
          <Link href="/" className="hover:text-ink">
            folyo ile kendi sayfanı aç
          </Link>
          {me && !owner && (
            <ReportButton target="PROFILE" targetId={page.username} title="Bu sayfayı şikayet et" label="Bu sayfayı şikayet et" showLabel className="text-xs hover:text-danger" />
          )}
        </footer>
      </main>
    </div>
  );
}

/** Sayfa yalniz giris yapanlara ya da dogrulanmis hesaplara acik: ne yapilmasi gerektigi soylenir. */
function RestrictedNotice({ username, requirement }: { username: string; requirement: "SIGNED_IN" | "VERIFIED" }) {
  const next = encodeURIComponent(`/${username}`);
  const signIn = requirement === "SIGNED_IN";
  return (
    <main className={`${MAIN} flex flex-1 flex-col items-center justify-center text-center`}>
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-2">
        <IconLock size={26} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Bu sayfa herkese açık değil</h1>
      <p className="mt-2 max-w-sm text-ink-2">
        {signIn
          ? "Sayfa sahibi sayfasını yalnız giriş yapmış kullanıcılara açtı."
          : "Sayfa sahibi sayfasını yalnız hesabı doğrulanmış kullanıcılara açtı."}
      </p>
      <Link
        href={signIn ? `/login?next=${next}` : `/hesap/dogrulama?next=${next}`}
        className="mt-6 inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-on-accent"
      >
        {signIn ? "Giriş yap" : "Hesabını doğrula"}
      </Link>
    </main>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-hidden="true" className={`${MAIN} animate-pulse`}>
      <div className="flex items-center gap-5 mb-8">
        <div className="size-[84px] rounded-full bg-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 rounded bg-surface-2" />
          <div className="h-4 w-72 rounded bg-surface-2" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 h-[132px] rounded-[var(--card-radius)] bg-surface-2" />
        <div className="h-[132px] rounded-[var(--card-radius)] bg-surface-2" />
        <div className="h-[132px] rounded-[var(--card-radius)] bg-surface-2" />
      </div>
    </div>
  );
}
