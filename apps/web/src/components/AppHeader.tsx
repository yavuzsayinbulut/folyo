"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconCompass, IconMessageCircle } from "@tabler/icons-react";
import { api } from "@/lib/client-api";
import { useRealtime } from "@/lib/realtime";
import type { ChatUnread, Me } from "@/lib/types";
import { Avatar } from "./Avatar";

/** Okunmamis sohbet sayisi: acilista, yeni mesajda ve dakikada bir tazelenir. */
export function useChatUnread(enabled: boolean) {
  const [unread, setUnread] = useState<ChatUnread | null>(null);
  const load = useCallback(() => {
    if (enabled) api<ChatUnread>("/api/me/conversations/unread").then(setUnread, () => undefined);
  }, [enabled]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);
  return [unread, load] as const;
}

/** Sohbet ekrani bir sohbeti okundu yapinca rozet tazelensin diye yayinlanan olay. */
export const UNREAD_CHANGED = "folyo:unread-changed";

function UnreadRealtime({ onChange }: { onChange: () => void }) {
  useRealtime((event) => {
    if (event.type === "message" || event.type === "ready") onChange();
  });
  useEffect(() => {
    window.addEventListener(UNREAD_CHANGED, onChange);
    return () => window.removeEventListener(UNREAD_CHANGED, onChange);
  }, [onChange]);
  return null;
}

/** Kesfet, gonderi ve sohbet sayfalarinin ust cubugu. */
export function AppHeader({ me }: { me: Me | null }) {
  const pathname = usePathname();
  const [unread, reload] = useChatUnread(!!me);
  const badge = unread ? unread.chats + unread.requests : 0;
  const link = (href: string, active: boolean) =>
    `inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm ${active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"}`;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      {me && <UnreadRealtime onChange={reload} />}
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
        <Link href="/" className="mr-2 font-semibold text-accent">
          folyo
        </Link>
        <nav aria-label="Ana bölümler" className="flex gap-1">
          <Link href="/kesfet" className={link("/kesfet", pathname.startsWith("/kesfet") || pathname.startsWith("/p/"))}>
            <IconCompass size={17} aria-hidden="true" />
            <span className="hidden sm:inline">Keşfet</span>
          </Link>
          {me && (
            <Link href="/sohbet" className={link("/sohbet", pathname.startsWith("/sohbet"))}>
              <IconMessageCircle size={17} aria-hidden="true" />
              <span className="hidden sm:inline">Sohbetler</span>
              {badge > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-medium leading-5 text-on-accent" aria-label={`${badge} okunmamış`}>
                  {badge}
                </span>
              )}
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {me ? (
            <Link href="/edit" className="inline-flex items-center gap-2 rounded-xl py-1 pl-1 pr-3 text-sm hover:bg-surface-2">
              <Avatar name={me.user.name} url={me.user.avatarUrl} size={28} />
              <span className="hidden sm:inline">{me.profile ? "Sayfam" : "Sayfanı aç"}</span>
            </Link>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="inline-flex h-9 items-center rounded-xl bg-accent px-3 text-sm font-medium text-on-accent">
              Giriş yap
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
