"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconArrowUpRight, IconCompass, IconLogout, IconMessageCircle, IconSettings } from "@tabler/icons-react";
import { api, ApiError, fetchMe } from "@/lib/client-api";
import type { Card, Me, Profile } from "@/lib/types";
import { themeProps } from "@/lib/themes";
import { useChatUnread } from "../AppHeader";
import { Avatar } from "../Avatar";
import { BentoGrid } from "../CardTile";
import { useConfirm } from "../ConfirmDialog";
import { AppearancePicker } from "./AppearancePicker";
import { AvatarPicker } from "./AvatarPicker";
import { CardManager } from "./CardManager";
import { ClaimForm } from "./ClaimForm";
import { CopyLink, GettingStarted } from "./GettingStarted";
import { GuestbookModeration } from "./GuestbookModeration";
import { PrivacyForm } from "./PrivacyForm";
import { ProfileForm } from "./ProfileForm";
import { StatsPanel } from "./StatsPanel";

export function Editor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    fetchMe().then(
      (result) => {
        if (!result) {
          const query = searchParams.toString();
          router.replace(`/login?next=${encodeURIComponent(`/edit${query ? `?${query}` : ""}`)}`);
          return;
        }
        setMe(result);
      },
      () => setFailed(true),
    );
  }, [router, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed)
    return (
      <LoadError
        onRetry={() => {
          setFailed(false);
          load();
        }}
      />
    );
  if (!me) return <p className="p-8 text-ink-3">Yükleniyor…</p>;

  if (!me.profile) {
    return (
      <ClaimForm
        me={me}
        initialUsername={searchParams.get("username") ?? ""}
        onClaimed={(profile) => setMe({ ...me, profile })}
      />
    );
  }

  const connected = searchParams.get("connected");
  const connectError = searchParams.get("connectError");
  const notice = connected
    ? { ok: true, text: `${connected === "spotify" ? "Spotify" : "Strava"} hesabın bağlandı. Şimdi kartını ekleyebilirsin.` }
    : connectError
      ? { ok: false, text: "Hesap bağlanmadı: izin verilmedi." }
      : null;

  return (
    <Workspace
      me={me}
      profile={me.profile}
      notice={notice}
      onProfileChange={(profile) => setMe({ ...me, profile })}
      onAvatarChange={(avatarUrl) => setMe({ ...me, user: { ...me.user, avatarUrl } })}
    />
  );
}

function Workspace({
  me,
  profile,
  notice,
  onProfileChange,
  onAvatarChange,
}: {
  me: Me;
  profile: Profile;
  notice: { ok: boolean; text: string } | null;
  onProfileChange: (p: Profile) => void;
  onAvatarChange: (url: string | null) => void;
}) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [cardsFailed, setCardsFailed] = useState(false);
  const [tab, setTab] = useState<"edit" | "stats">("edit");
  const [unread] = useChatUnread(true);
  const badge = unread ? unread.chats + unread.requests : 0;
  const pageUrl = `${typeof window === "undefined" ? "" : window.location.origin}/${profile.username}`;

  const loadCards = useCallback(() => {
    api<Card[]>("/api/me/cards").then(setCards, () => setCardsFailed(true));
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      // Sunucuya ulasilamasa da kullanici cikis yapmak istedi; giris sayfasina donulur.
      router.push("/");
    }
  }

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 h-14">
          <Link href="/" className="font-semibold text-accent">folyo</Link>
          <span className="text-ink-3">/</span>
          <span className="text-sm text-ink-2 truncate">{profile.username}</span>
          <nav aria-label="Editör bölümleri" className="ml-4 flex gap-1">
            {(
              [
                ["edit", "Düzenle"],
                ["stats", "İstatistik"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                aria-current={tab === value ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ${tab === value ? "bg-surface-2 text-ink font-medium" : "text-ink-2 hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
            <Link href="/sohbet" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:text-ink">
              <IconMessageCircle size={16} aria-hidden="true" className="hidden sm:inline" />
              Sohbetler
              {badge > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-medium leading-5 text-on-accent" aria-label={`${badge} okunmamış`}>
                  {badge}
                </span>
              )}
            </Link>
            <Link href="/kesfet" className="hidden h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:text-ink sm:inline-flex">
              <IconCompass size={16} aria-hidden="true" />
              Keşfet
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me.user.admin && (
              <Link href="/admin" className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
                <IconSettings size={16} aria-hidden="true" /> Yönetim
              </Link>
            )}
            <CopyLink url={pageUrl} compact className="hidden sm:inline-flex" />
            <Link href={`/${profile.username}`} target="_blank" className="inline-flex h-9 items-center gap-1 rounded-xl border border-line-strong px-3 text-sm hover:bg-surface-2">
              Sayfanı gör <IconArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <button onClick={logout} aria-label="Çıkış yap" className="inline-flex size-9 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2">
              <IconLogout size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {tab === "stats" ? (
        <div className="mx-auto max-w-4xl px-4 py-8">
          <StatsPanel username={profile.username} />
        </div>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex flex-col gap-6 min-w-0">
            {notice && (
              <p role="status" className={`rounded-xl px-4 py-3 text-sm ${notice.ok ? "bg-ok-soft text-ok-ink" : "bg-surface-2 text-danger"}`}>
                {notice.text}
              </p>
            )}
            {cards && <GettingStarted profile={profile} cards={cards} pageUrl={pageUrl} />}
            <AvatarPicker name={profile.displayName} url={me.user.avatarUrl} onChange={onAvatarChange} />
            <ProfileForm profile={profile} onSaved={onProfileChange} />
            <AppearancePicker profile={profile} onSaved={onProfileChange} />
            <PrivacyForm profile={profile} onSaved={onProfileChange} />
            {cards ? (
              <CardManager cards={cards} onChange={setCards} />
            ) : cardsFailed ? (
              <p role="alert" className="flex items-center gap-3 text-sm text-danger">
                Kartlar yüklenemedi.
                <button
                  onClick={() => {
                    setCardsFailed(false);
                    loadCards();
                  }}
                  className="text-ink-2 underline underline-offset-2"
                >
                  Tekrar dene
                </button>
              </p>
            ) : (
              <p className="text-ink-3">Kartlar yükleniyor…</p>
            )}
            <GuestbookModeration />
            <AccountSettings username={profile.username} verified={me.user.verified} />
          </div>

          <aside aria-label="Önizleme" className="lg:sticky lg:top-20 self-start min-w-0">
            <p className="mb-2 text-sm text-ink-3">Ziyaretçi böyle görüyor</p>
            <div className="theme-root rounded-3xl border border-line p-5 transition-colors" {...themeProps(profile.theme, profile.accent)}>
              <div className="mb-5 flex items-center gap-4">
                <Avatar name={profile.displayName} url={me.user.avatarUrl} size={56} />
                <div className="min-w-0">
                  <p className="font-display font-semibold text-lg truncate">{profile.displayName}</p>
                  {profile.bio && <p className="text-sm text-ink-2 line-clamp-2">{profile.bio}</p>}
                </div>
                {profile.status && (
                  <span className="ml-auto shrink-0 rounded-full bg-ok-soft px-2.5 py-1 text-xs text-ok-ink">{profile.status}</span>
                )}
              </div>
              {cards && cards.some((c) => c.visible) ? (
                <BentoGrid cards={cards.filter((c) => c.visible)} interactive={false} />
              ) : (
                <p className="rounded-[var(--card-radius)] border border-dashed border-line-strong p-8 text-center text-sm text-ink-3">
                  Kart ekledikçe burada görünecek.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-start gap-3 p-8">
      <p className="text-lg font-medium">Sunucuya ulaşılamadı</p>
      <p className="text-ink-2">Bağlantını kontrol edip tekrar dene. Kaydedilmiş hiçbir şey kaybolmadı.</p>
      <button onClick={onRetry} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent">
        Tekrar dene
      </button>
    </div>
  );
}

/** Hesap silme: kullanici adini yazarak onaylanir; geri donusu yoktur. */
function AccountSettings({ username, verified }: { username: string; verified: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    const ok = await confirm({
      title: "Hesabın kalıcı olarak silinsin mi?",
      body: "Sayfan, kartların, fotoğrafların, istatistiklerin, bağlı hesapların ve başka sayfalara bıraktığın mesajlar silinir. Bu işlem geri alınamaz.",
      confirmLabel: "Hesabımı sil",
      danger: true,
      typeToConfirm: username,
    });
    if (!ok) return;
    try {
      await api("/api/me/account", { method: "DELETE" });
      router.replace("/?hesap=silindi");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Hesap silinemedi, tekrar dene.");
    }
  }

  return (
    <section aria-labelledby="account" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="account" className="font-medium">Hesap</h2>
      <p className="mt-1 text-sm">
        {verified ? (
          <span className="text-ok-ink">Hesabın doğrulanmış.</span>
        ) : (
          <span className="text-ink-2">Başka sayfalara mesaj ve yorum yazmak için hesabını doğrula.</span>
        )}{" "}
        <Link href="/hesap/dogrulama" className="underline underline-offset-2 hover:text-ink">
          {verified ? "Doğrulama bilgileri" : "Doğrula"}
        </Link>
      </p>
      <p className="mt-1 text-sm text-ink-3">
        Verilerin nasıl kullanıldığını{" "}
        <Link href="/gizlilik" className="underline underline-offset-2 hover:text-ink">
          gizlilik sayfasında
        </Link>{" "}
        anlattık.
      </p>
      <button onClick={deleteAccount} className="mt-4 h-9 rounded-xl border border-danger/40 px-3 text-sm text-danger hover:bg-danger/10">
        Hesabımı sil
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {confirmDialog}
    </section>
  );
}
