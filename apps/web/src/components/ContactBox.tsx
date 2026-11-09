"use client";

import Link from "next/link";
import { useState } from "react";
import { IconCheck, IconMail } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import type { Interaction } from "@/lib/types";
import { InteractionNotice } from "./InteractionNotice";

const MAX = 4000;

/**
 * Iletisim kutusu: sayfa sahibiyle ozel sohbeti baslatir (ya da varsa ona yazar). Karsi tarafa adin ve profil
 * fotografin gorunur, e-postan ve telefonun asla gosterilmez.
 */
export function ContactBox({ username, displayName, interaction }: { username: string; displayName: string; interaction: Interaction }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [conversation, setConversation] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (text.length < 2) return setError("Önce bir mesaj yaz");
    setSending(true);
    setError(null);
    try {
      const started = await api<{ conversationId: string }>(`/api/profiles/${username}/messages`, { method: "POST", body: { body: text } });
      setBody("");
      setConversation(started.conversationId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Mesaj gönderilemedi, tekrar dene.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="contact" className="rounded-[var(--card-radius)] border border-line bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <IconMail size={18} className="text-ink-2" aria-hidden="true" />
        <h2 id="contact" className="font-medium">
          Mesaj gönder
        </h2>
      </div>
      {interaction !== "ALLOWED" ? (
        <InteractionNotice interaction={interaction} username={username} action="Mesaj göndermek" />
      ) : conversation ? (
        <div role="status" className="flex items-start gap-3 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok-ink">
          <IconCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Mesajın gönderildi</p>
            <Link href={`/sohbet/${conversation}`} className="mt-1 inline-block underline underline-offset-2">
              Sohbete git
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={send}>
          <label htmlFor="contact-body" className="sr-only">
            Mesajın
          </label>
          <textarea
            id="contact-body"
            value={body}
            maxLength={MAX}
            onChange={(e) => {
              setBody(e.target.value);
              setError(null);
            }}
            placeholder="Merhaba, projen hakkında konuşmak isterim…"
            className="min-h-28 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-3">{displayName} ile özel sohbetin açılır. Adın ve fotoğrafın görünür, e-postan ve telefonun görünmez.</p>
            <button disabled={sending} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60">
              {sending ? "Gönderiliyor…" : "Gönder"}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
