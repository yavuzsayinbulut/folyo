"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconArchive, IconMessageCircle, IconSettings } from "@tabler/icons-react";
import { api } from "@/lib/client-api";
import { useRealtime } from "@/lib/realtime";
import { listTime } from "@/lib/time";
import type { ChatFolder, Conversation, Me } from "@/lib/types";
import { Avatar } from "../Avatar";
import { UNREAD_CHANGED } from "../AppHeader";
import { ChatSettingsDialog } from "./ChatSettingsDialog";
import { ConversationPane } from "./ConversationPane";
import { messagePreview, Ticks } from "./MessageBubble";

const FOLDERS: { key: ChatFolder; label: string; empty: string }[] = [
  { key: "CHATS", label: "Sohbetler", empty: "Henüz sohbetin yok. Bir sayfadaki “Mesaj gönder” kutusundan başlayabilirsin." },
  { key: "REQUESTS", label: "İstekler", empty: "Bekleyen mesaj isteği yok." },
  { key: "ARCHIVE", label: "Arşiv", empty: "Arşivde sohbet yok." },
];

/**
 * WhatsApp benzeri sohbet ekrani: solda liste, sagda acik konusma. Liste anlik olaylarla guncellenir;
 * baglanti yeniden kurulunca ("ready") kacirilanlar HTTP ile tazelenir.
 */
export function ChatApp({ me }: { me: Me }) {
  const params = useParams<{ id?: string }>();
  const selectedId = params.id ?? null;
  const [folder, setFolder] = useState<ChatFolder>("CHATS");
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(() => {
    api<Conversation[]>(`/api/me/conversations?folder=${folder}`).then(
      (list) => {
        setConversations(list);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [folder]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback((id: string, change: (c: Conversation) => Conversation) => {
    setConversations((list) => list && list.map((c) => (c.id === id ? change(c) : c)));
  }, []);

  useRealtime((event) => {
    switch (event.type) {
      case "ready":
        load();
        break;
      case "message": {
        const { conversationId, message } = event;
        const known = conversations?.some((c) => c.id === conversationId);
        if (!known) {
          // Yeni sohbet ya da baska klasorden: listeyi yeniden al.
          load();
          return;
        }
        const open = conversationId === selectedId && document.visibilityState === "visible";
        setConversations((list) => {
          if (!list) return list;
          const target = list.find((c) => c.id === conversationId)!;
          const updated: Conversation = {
            ...target,
            lastMessage: message,
            lastMessageAt: message.createdAt,
            unread: message.mine || open ? target.unread : target.unread + 1,
          };
          return [updated, ...list.filter((c) => c.id !== conversationId)];
        });
        setTyping((t) => ({ ...t, [conversationId]: 0 }));
        break;
      }
      case "receipt":
        patch(event.conversationId, (c) =>
          event.userId === c.other.userId
            ? { ...c, otherDeliveredSeq: Math.max(c.otherDeliveredSeq, event.deliveredSeq), otherReadSeq: event.readSeq ?? c.otherReadSeq }
            : c,
        );
        break;
      case "typing":
        setTyping((t) => ({ ...t, [event.conversationId]: Date.now() }));
        break;
      case "presence":
        setConversations(
          (list) =>
            list &&
            list.map((c) =>
              c.other.userId === event.userId ? { ...c, presence: event.hidden ? null : { online: event.online, lastSeenAt: event.lastSeenAt } } : c,
            ),
        );
        break;
      case "deleted":
        patch(event.conversationId, (c) =>
          c.lastMessage?.id === event.messageId ? { ...c, lastMessage: { ...c.lastMessage, deleted: true, body: null, asset: null, stickerUrl: null } } : c,
        );
        break;
    }
  });

  // "Yaziyor" 4 sn icinde yeni sinyal gelmezse kaybolur.
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        const stale = Object.entries(t).some(([, at]) => at > 0 && now - at > 4000);
        return stale ? Object.fromEntries(Object.entries(t).map(([k, at]) => [k, now - at > 4000 ? 0 : at])) : t;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const onRead = useCallback(
    (id: string) => {
      patch(id, (c) => ({ ...c, unread: 0 }));
      window.dispatchEvent(new Event(UNREAD_CHANGED));
    },
    [patch],
  );

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  const isTyping = (id: string) => (typing[id] ?? 0) > 0;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 border-x border-line bg-surface">
      <aside
        aria-label="Sohbetler"
        className={`flex min-h-0 w-full flex-col border-r border-line md:w-[340px] md:shrink-0 ${selectedId ? "hidden md:flex" : "flex"}`}
      >
        <div className="flex items-center gap-1 border-b border-line px-3 py-2">
          <nav aria-label="Klasörler" className="flex flex-1 gap-1">
            {FOLDERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFolder(f.key)}
                aria-current={folder === f.key ? "page" : undefined}
                className={`h-8 rounded-lg px-2.5 text-sm ${folder === f.key ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {f.label}
              </button>
            ))}
          </nav>
          <button onClick={() => setSettingsOpen(true)} aria-label="Sohbet ayarları" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
            <IconSettings size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {failed ? (
            <p role="alert" className="p-4 text-sm text-danger">
              Sohbetler yüklenemedi.{" "}
              <button onClick={load} className="underline">
                Tekrar dene
              </button>
            </p>
          ) : !conversations ? (
            <p className="p-4 text-sm text-ink-3">Yükleniyor…</p>
          ) : conversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-3">{FOLDERS.find((f) => f.key === folder)!.empty}</p>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/sohbet/${c.id}`}
                    aria-current={c.id === selectedId ? "page" : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2 ${c.id === selectedId ? "bg-surface-2" : ""}`}
                  >
                    <span className="relative shrink-0">
                      <Avatar name={c.other.name} url={c.other.avatarUrl} size={46} />
                      {c.presence?.online && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-emerald-500" aria-label="Çevrimiçi" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-medium">{c.other.name}</span>
                        {c.lastMessageAt && (
                          <span className={`ml-auto shrink-0 text-xs ${c.unread > 0 ? "text-accent" : "text-ink-3"}`}>{listTime(c.lastMessageAt)}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 text-sm text-ink-2">
                        {isTyping(c.id) ? (
                          <span className="text-accent">yazıyor…</span>
                        ) : (
                          <>
                            {c.lastMessage?.mine && !c.lastMessage.deleted && <Ticks message={c.lastMessage} conversation={c} />}
                            <span className="truncate">{c.lastMessage ? messagePreview(c.lastMessage) : ""}</span>
                          </>
                        )}
                        {c.unread > 0 && (
                          <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-[11px] font-medium leading-5 text-on-accent" aria-label={`${c.unread} okunmamış`}>
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section aria-label="Konuşma" className={`min-h-0 min-w-0 flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {selectedId ? (
          <ConversationPane
            key={selectedId}
            id={selectedId}
            me={me}
            summary={selected}
            typing={isTyping(selectedId)}
            onConversation={(c) => {
              setConversations((list) => {
                if (!list) return list;
                const inFolder =
                  (folder === "CHATS" && c.state === "ACTIVE") || (folder === "REQUESTS" && c.state === "REQUEST") || (folder === "ARCHIVE" && c.state === "ARCHIVED");
                const exists = list.some((o) => o.id === c.id);
                if (!inFolder) return list.filter((o) => o.id !== c.id);
                return exists ? list.map((o) => (o.id === c.id ? { ...c, unread: o.id === selectedId ? 0 : c.unread } : o)) : [c, ...list];
              });
            }}
            onMessage={(message) =>
              setConversations(
                (list) =>
                  list &&
                  list.map((c) => (c.id === selectedId && (!c.lastMessage || c.lastMessage.seq <= message.seq) ? { ...c, lastMessage: message, lastMessageAt: message.createdAt } : c)),
              )
            }
            onRead={onRead}
            onLeft={load}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-ink-3">
            {folder === "ARCHIVE" ? <IconArchive size={40} aria-hidden="true" /> : <IconMessageCircle size={40} aria-hidden="true" />}
            <p>Bir sohbet seç.</p>
            <p className="max-w-xs text-xs">Mesajların yalnız sen ve karşındaki kişi arasında kalır. E-posta ve telefonun kimseye gösterilmez.</p>
          </div>
        )}
      </section>
      {settingsOpen && <ChatSettingsDialog onClose={() => setSettingsOpen(false)} onChanged={load} />}
    </div>
  );
}
