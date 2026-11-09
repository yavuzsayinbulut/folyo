import type { ChatMessage } from "./types";

/** Sohbet listesindeki son mesaj ozeti. */
export function messagePreview(m: ChatMessage): string {
  if (m.deleted) return "Bu mesaj silindi";
  if (m.kind === "PHOTO") return m.body ? `📷 ${m.body}` : "📷 Fotoğraf";
  if (m.kind === "VIDEO") return m.body ? `🎥 ${m.body}` : "🎥 Video";
  if (m.kind === "STICKER") return "Sticker";
  return m.body ?? "";
}
