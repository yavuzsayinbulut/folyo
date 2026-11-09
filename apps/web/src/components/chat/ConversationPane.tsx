"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconArchive, IconArchiveOff, IconArrowLeft, IconBan, IconDotsVertical, IconFlag } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import { useRealtime } from "@/lib/realtime";
import { dayLabel, lastSeen, sameDay } from "@/lib/time";
import type { ChatMessage, ChatThread, Conversation, Me } from "@/lib/types";
import { Avatar } from "../Avatar";
import { useConfirm } from "../ConfirmDialog";
import { ReportDialog } from "../moderation/ReportDialog";
import { ChatComposer, type Outgoing } from "./ChatComposer";
import { type LocalMessage, MessageBubble } from "./MessageBubble";

/** Mesajlari sira numarasina gore tekillestirir; ayni mesaj hem HTTP yanitindan hem anlik olaydan gelebilir. */
function merge(list: LocalMessage[], incoming: LocalMessage[]): LocalMessage[] {
  const byId = new Map<number, LocalMessage>();
  for (const m of [...list, ...incoming]) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.pending || a.failed ? 1 : 0) - (b.pending || b.failed ? 1 : 0) || a.seq - b.seq || a.id - b.id);
}

let localIds = -1;

export function ConversationPane({
  id,
  me,
  summary,
  typing,
  onConversation,
  onMessage,
  onRead,
  onLeft,
}: {
  id: string;
  me: Me;
  summary: Conversation | null;
  typing: boolean;
  onConversation: (c: Conversation) => void;
  onMessage: (m: ChatMessage) => void;
  onRead: (id: string) => void;
  onLeft: () => void;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [loaded, setConversation] = useState<Conversation | null>(summary);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastRead = useRef(0);

  // "Herkesten sil" 48 saatle sinirli; sure dakikada bir tazelenir.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(() => {
    api<ChatThread>(`/api/me/conversations/${id}`).then(
      (thread) => {
        setConversation(thread.conversation);
        setMessages((list) => merge(list.filter((m) => m.pending || m.failed), thread.messages));
        setNextBefore(thread.nextBefore);
        setStatus("ready");
        onConversation(thread.conversation);
      },
      (e) => setStatus(e instanceof ApiError && e.status === 404 ? "missing" : "failed"),
    );
    // onConversation ust bilesende her render'da yeniden olusur; yalniz konusma degisince yuklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Gorunur durumdaysa karsi tarafin son mesajina kadar okundu yapilir (karsi tarafa mavi tik). */
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    const lastIncoming = [...messages].reverse().find((m) => !m.mine && m.id > 0);
    if (!lastIncoming || lastIncoming.seq <= lastRead.current) return;
    lastRead.current = lastIncoming.seq;
    api(`/api/me/conversations/${id}/read`, { method: "POST", body: { seq: lastIncoming.seq } }).then(
      () => onRead(id),
      () => (lastRead.current = 0),
    );
  }, [id, messages, onRead]);

  useEffect(() => {
    markRead();
    document.addEventListener("visibilitychange", markRead);
    window.addEventListener("focus", markRead);
    return () => {
      document.removeEventListener("visibilitychange", markRead);
      window.removeEventListener("focus", markRead);
    };
  }, [markRead]);

  useRealtime((event) => {
    if (event.type === "ready") {
      load();
      return;
    }
    if (!("conversationId" in event) || event.conversationId !== id) return;
    switch (event.type) {
      case "message":
        setMessages((list) => merge(list, [event.message]));
        break;
      case "receipt":
        setConversation((c) =>
          c && event.userId === c.other.userId
            ? { ...c, otherDeliveredSeq: Math.max(c.otherDeliveredSeq, event.deliveredSeq), otherReadSeq: event.readSeq ?? c.otherReadSeq }
            : c,
        );
        break;
      case "deleted":
        setMessages((list) => list.map((m) => (m.id === event.messageId ? { ...m, deleted: true, body: null, asset: null, stickerUrl: null } : m)));
        break;
    }
  });

  // Yeni mesaj gelince en alttaysak altta kalinir; yukarida eski mesajlari okuyorsak kaydirilmaz.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  async function older() {
    if (nextBefore == null) return;
    const el = scroller.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const thread = await api<ChatThread>(`/api/me/conversations/${id}?before=${nextBefore}`);
      stickToBottom.current = false;
      setMessages((list) => merge(list, thread.messages));
      setNextBefore(thread.nextBefore);
      // Eski mesajlar eklenince ekrandaki mesaj yerinde kalsin.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch {
      setError("Eski mesajlar yüklenemedi");
    }
  }

  async function send(outgoing: Outgoing, retryOf?: LocalMessage) {
    const clientId = retryOf?.clientId ?? crypto.randomUUID();
    const local: LocalMessage = retryOf
      ? { ...retryOf, failed: false, pending: true }
      : {
          id: localIds--,
          seq: Number.MAX_SAFE_INTEGER,
          senderId: me.user.id,
          mine: true,
          kind: outgoing.kind,
          body: outgoing.body ?? null,
          sticker: outgoing.sticker ?? null,
          stickerUrl: outgoing.stickerUrl ?? null,
          asset: outgoing.asset ?? null,
          createdAt: new Date().toISOString(),
          deleted: false,
          pending: true,
          clientId,
          retry: outgoing,
        };
    stickToBottom.current = true;
    setMessages((list) => merge(list.filter((m) => m.id !== local.id), [local]));
    try {
      const saved = await api<ChatMessage>(`/api/me/conversations/${id}/messages`, {
        method: "POST",
        body: { clientId, kind: outgoing.kind, body: outgoing.body, assetId: outgoing.asset?.id ?? outgoing.assetId, sticker: outgoing.sticker },
      });
      setMessages((list) => merge(list.filter((m) => m.id !== local.id), [saved]));
      onMessage(saved);
      // Yanit veren istegi kabul etmis olur; arsivdeki sohbet geri gelir.
      if (loaded && loaded.state !== "ACTIVE") {
        setConversation({ ...loaded, state: "ACTIVE" });
        onConversation({ ...loaded, state: "ACTIVE", lastMessage: saved, lastMessageAt: saved.createdAt });
      }
    } catch (e) {
      setMessages((list) => list.map((m) => (m.id === local.id ? { ...m, pending: false, failed: true } : m)));
      setError(e instanceof ApiError ? e.message : "Mesaj gönderilemedi");
    }
  }

  async function remove(message: LocalMessage) {
    const ok = await confirm({ title: "Herkesten silinsin mi?", body: "Mesaj iki taraftan da kaldırılır; yerine “Bu mesaj silindi” yazar.", confirmLabel: "Herkesten sil", danger: true });
    if (!ok) return;
    try {
      await api(`/api/me/conversations/${id}/messages/${message.id}`, { method: "DELETE" });
      setMessages((list) => list.map((m) => (m.id === message.id ? { ...m, deleted: true, body: null, asset: null, stickerUrl: null } : m)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Silinemedi");
    }
  }

  async function setState(state: "ACTIVE" | "ARCHIVED") {
    setMenu(false);
    try {
      await api(`/api/me/conversations/${id}`, { method: "PATCH", body: { state } });
      if (loaded) {
        const next = { ...loaded, state };
        setConversation(next);
        onConversation(next);
      }
      if (state === "ARCHIVED") router.push("/sohbet");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Olmadı, tekrar dene");
    }
  }

  async function block() {
    setMenu(false);
    const name = loaded?.other.name ?? "Bu kişi";
    const ok = await confirm({
      title: `${name} engellensin mi?`,
      body: "Sana mesaj gönderemez, gönderilerine yanıt veremez ve ziyaretçi defterine yazamaz. Sohbet arşive taşınır. Engeli sohbet ayarlarından kaldırabilirsin.",
      confirmLabel: "Engelle",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/me/conversations/${id}/block`, { method: "POST" });
      onLeft();
      router.push("/sohbet");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Engellenemedi");
    }
  }

  if (status === "missing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-ink-3">
        <p>Bu sohbet bulunamadı.</p>
        <Link href="/sohbet" className="underline">
          Sohbetlere dön
        </Link>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <p role="alert" className="p-6 text-sm text-danger">
        Sohbet yüklenemedi.{" "}
        <button
          onClick={() => {
            setStatus("loading");
            load();
          }}
          className="underline"
        >
          Tekrar dene
        </button>
      </p>
    );
  }
  if (!loaded) return <p className="p-6 text-sm text-ink-3">Yükleniyor…</p>;

  // Ust listedeki ozet anlik olaylarla (cevrimici, tik) guncellenir; ikisinden yeni olan kullanilir.
  const conversation: Conversation = summary
    ? {
        ...loaded,
        presence: summary.presence,
        otherDeliveredSeq: Math.max(loaded.otherDeliveredSeq, summary.otherDeliveredSeq),
        otherReadSeq: summary.otherReadSeq == null ? loaded.otherReadSeq : Math.max(loaded.otherReadSeq ?? 0, summary.otherReadSeq),
      }
    : loaded;
  const { other } = conversation;
  const presence = typing ? "yazıyor…" : conversation.presence?.online ? "çevrimiçi" : conversation.presence?.lastSeenAt ? lastSeen(conversation.presence.lastSeenAt) : "";

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-3 py-2">
        <Link href="/sohbet" aria-label="Sohbetlere dön" className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 md:hidden">
          <IconArrowLeft size={20} aria-hidden="true" />
        </Link>
        {other.username ? (
          <Link href={`/${other.username}`} className="flex min-w-0 items-center gap-3">
            <Avatar name={other.name} url={other.avatarUrl} size={40} />
            <PersonLine name={other.name} presence={presence} typing={typing} />
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={other.name} url={other.avatarUrl} size={40} />
            <PersonLine name={other.name} presence={presence} typing={typing} />
          </span>
        )}
        <div className="relative ml-auto">
          <button onClick={() => setMenu((m) => !m)} aria-label="Sohbet menüsü" aria-expanded={menu} className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
            <IconDotsVertical size={19} aria-hidden="true" />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-10 z-10 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
              {conversation.state === "ARCHIVED" ? (
                <button role="menuitem" onClick={() => setState("ACTIVE")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                  <IconArchiveOff size={17} aria-hidden="true" /> Arşivden çıkar
                </button>
              ) : (
                <button role="menuitem" onClick={() => setState("ARCHIVED")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                  <IconArchive size={17} aria-hidden="true" /> Arşivle
                </button>
              )}
              {other.username && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setReporting(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <IconFlag size={17} aria-hidden="true" /> Şikayet et
                </button>
              )}
              <button role="menuitem" onClick={block} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface-2">
                <IconBan size={17} aria-hidden="true" /> Engelle
              </button>
            </div>
          )}
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-bg px-3 py-4 sm:px-6"
      >
        {nextBefore != null && (
          <div className="mb-3 text-center">
            <button onClick={older} className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 hover:text-ink">
              Daha eski mesajlar
            </button>
          </div>
        )}
        {status === "loading" && messages.length === 0 && <p className="text-center text-sm text-ink-3">Yükleniyor…</p>}
        <div className="flex flex-col gap-1.5">
          {messages.map((m, i) => (
            <Fragment key={m.id}>
              {(i === 0 || !sameDay(messages[i - 1].createdAt, m.createdAt)) && (
                <p className="my-2 self-center rounded-full bg-surface px-3 py-0.5 text-xs text-ink-3 shadow-sm">{dayLabel(m.createdAt)}</p>
              )}
              <MessageBubble message={m} conversation={conversation} now={now} onDelete={remove} onRetry={(failed) => failed.retry && send(failed.retry, failed)} />
            </Fragment>
          ))}
        </div>
        {typing && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2 text-sm text-ink-3" aria-live="polite">
            <span className="animate-pulse">•••</span>
          </p>
        )}
      </div>

      {conversation.state === "REQUEST" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 text-ink-2">
            <strong className="text-ink">{other.name}</strong> sana mesaj göndermek istiyor. Yanıt verirsen ya da kabul edersen sohbet açılır.
          </p>
          <button onClick={() => setState("ACTIVE")} className="h-9 rounded-xl bg-accent px-3 font-medium text-on-accent">
            Kabul et
          </button>
          <button onClick={block} className="h-9 rounded-xl border border-danger/40 px-3 text-danger hover:bg-danger/10">
            Engelle
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="border-t border-line px-4 py-2 text-sm text-danger">
          {error}{" "}
          <button onClick={() => setError(null)} className="text-ink-3 underline">
            Kapat
          </button>
        </p>
      )}
      <ChatComposer conversationId={id} onSend={(o) => send(o)} onError={setError} />
      {confirmDialog}
      {reporting && other.username && (
        <ReportDialog target="PROFILE" targetId={other.username} title={`${other.name} kişisini şikayet et`} onClose={() => setReporting(false)} />
      )}
    </>
  );
}

function PersonLine({ name, presence, typing }: { name: string; presence: string; typing: boolean }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{name}</span>
      {presence && <span className={`block truncate text-xs ${typing ? "text-accent" : "text-ink-3"}`}>{presence}</span>}
    </span>
  );
}

