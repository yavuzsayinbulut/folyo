"use client";

/* eslint-disable @next/next/no-img-element -- sohbet medyasi API'den yetki kontroluyle gelir */
import { useState } from "react";
import { IconCheck, IconChecks, IconClock, IconExclamationCircle, IconTrash } from "@tabler/icons-react";
import { clockTime } from "@/lib/time";
import type { ChatMessage, Conversation } from "@/lib/types";
import { RichText } from "../posts/PostCard";
import { Lightbox, VideoPlayer } from "../media/MediaGrid";
import { ReportButton } from "../moderation/ReportDialog";

/** Istemcide henuz sunucuya ulasmamis mesaj; retry: basarisiz olursa ayni istemci kimligiyle yeniden gonderilecek icerik. */
export type LocalMessage = ChatMessage & {
  pending?: boolean;
  failed?: boolean;
  clientId?: string;
  retry?: { kind: ChatMessage["kind"]; body?: string | null; asset?: ChatMessage["asset"]; assetId?: string; sticker?: string; stickerUrl?: string };
};

export function messagePreview(message: ChatMessage): string {
  if (message.deleted) return "Bu mesaj silindi";
  switch (message.kind) {
    case "PHOTO":
      return message.body ? `📷 ${message.body}` : "📷 Fotoğraf";
    case "VIDEO":
      return message.body ? `🎥 ${message.body}` : "🎥 Video";
    case "STICKER":
      return "Sticker";
    default:
      return message.body ?? "";
  }
}

/**
 * Tek tik: sunucuya ulasti. Cift gri: karsi tarafin cihazina ulasti. Cift mavi: okundu (iki taraf da okundu
 * bilgisini aciksa). Saat: gonderiliyor.
 */
export function Ticks({ message, conversation }: { message: LocalMessage; conversation: Pick<Conversation, "otherDeliveredSeq" | "otherReadSeq"> }) {
  if (message.failed) return <IconExclamationCircle size={15} className="shrink-0 text-danger" aria-label="Gönderilemedi" />;
  if (message.pending) return <IconClock size={14} className="shrink-0 opacity-70" aria-label="Gönderiliyor" />;
  if (conversation.otherReadSeq != null && message.seq <= conversation.otherReadSeq) {
    return <IconChecks size={16} className="shrink-0 text-sky-500" aria-label="Okundu" />;
  }
  if (message.seq <= conversation.otherDeliveredSeq) return <IconChecks size={16} className="shrink-0 opacity-70" aria-label="İletildi" />;
  return <IconCheck size={15} className="shrink-0 opacity-70" aria-label="Gönderildi" />;
}

const DELETE_WINDOW_MS = 48 * 3600 * 1000;

export function MessageBubble({
  message,
  conversation,
  now,
  onDelete,
  onRetry,
}: {
  message: LocalMessage;
  conversation: Conversation;
  now: number;
  onDelete: (message: LocalMessage) => void;
  onRetry: (message: LocalMessage) => void;
}) {
  const [zoom, setZoom] = useState(false);
  const mine = message.mine;
  const sticker = message.kind === "STICKER" && !message.deleted;
  const canDelete = mine && !message.deleted && !message.pending && !message.failed && now - new Date(message.createdAt).getTime() < DELETE_WINDOW_MS;
  const meta = (
    <span className={`ml-2 inline-flex translate-y-0.5 items-center gap-1 whitespace-nowrap text-[11px] ${mine && !sticker ? "text-on-accent/70" : "text-ink-3"}`}>
      {clockTime(message.createdAt)}
      {mine && !message.deleted && <Ticks message={message} conversation={conversation} />}
    </span>
  );

  return (
    <div className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {canDelete && (
        <button
          onClick={() => onDelete(message)}
          aria-label="Herkesten sil"
          className="mb-1 inline-flex size-7 items-center justify-center rounded-full text-ink-3 opacity-0 hover:bg-surface-2 hover:text-danger focus:opacity-100 group-hover:opacity-100"
        >
          <IconTrash size={15} aria-hidden="true" />
        </button>
      )}
      {sticker ? (
        <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
          <img src={message.stickerUrl ?? ""} alt="Sticker" width={140} height={140} className="size-[140px] object-contain" loading="lazy" />
          {meta}
        </div>
      ) : (
        <div
          className={`rounded-2xl px-3 py-1.5 text-[15px] leading-snug shadow-sm ${
            message.asset && !message.deleted ? "w-72 max-w-[85%]" : "max-w-[78%] sm:max-w-[65%]"
          } ${
            mine ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md bg-surface-2 text-ink"
          } ${message.failed ? "opacity-70" : ""}`}
        >
          {message.deleted ? (
            <p className="italic opacity-70">
              {mine ? "Bu mesajı sildin" : "Bu mesaj silindi"}
              {meta}
            </p>
          ) : (
            <>
              {message.asset && (
                <div className="-mx-1.5 mb-1 mt-0.5 overflow-hidden rounded-xl">
                  {message.asset.kind === "VIDEO" ? (
                    <VideoPlayer asset={message.asset} className="max-h-80 w-full bg-black" />
                  ) : (
                    <button onClick={() => setZoom(true)} aria-label="Fotoğrafı büyüt" className="block">
                      <img
                        src={message.asset.largeUrl}
                        alt=""
                        loading="lazy"
                        className="w-full object-cover"
                        // Cok uzun/genis fotograflar balonda kirpilir; dokununca orijinali tam acilir.
                        style={{ aspectRatio: message.asset.width && message.asset.height ? Math.min(Math.max(message.asset.width / message.asset.height, 0.75), 1.9) : 4 / 3 }}
                      />
                    </button>
                  )}
                </div>
              )}
              <p className="whitespace-pre-wrap break-words">
                {message.body && <RichText text={message.body} linkClassName={mine ? "underline underline-offset-2" : "text-accent underline underline-offset-2"} />}
                {meta}
              </p>
            </>
          )}
          {message.failed && (
            <button onClick={() => onRetry(message)} className="mt-1 text-xs underline">
              Gönderilemedi · tekrar dene
            </button>
          )}
        </div>
      )}
      {!mine && !message.deleted && message.id > 0 && (
        <ReportButton
          target="MESSAGE"
          targetId={String(message.id)}
          title="Mesajı şikayet et"
          className="mb-1 size-7 justify-center rounded-full text-ink-3 opacity-0 hover:bg-surface-2 hover:text-danger focus:opacity-100 group-hover:opacity-100"
        />
      )}
      {zoom && message.asset && <Lightbox media={[message.asset]} index={0} onIndex={() => undefined} onClose={() => setZoom(false)} />}
    </div>
  );
}
