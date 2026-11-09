"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "./types";

type Listener = (event: RealtimeEvent) => void;

/**
 * Sayfa basina tek WebSocket baglantisi: anlik mesaj, tik, "yaziyor" ve cevrimici bilgisi. Mesajlar HTTP ile
 * gonderilir (kaydedilir, tekrar denenir); bu kanal yalniz haber tasir. Baglanti koparsa artan araliklarla
 * yeniden kurulur; her kurulusta "ready" olayi gelir ve dinleyiciler kacirdiklarini HTTP ile tazeler.
 */
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function url(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (configured) return configured;
  // Ayni adres: gelistirmede Next'in /api yonlendirmesi, uretimde Caddy baglantiyi API'ye tasir. Boylece
  // oturum cerezi ve Origin kontrolu normal sayfa istekleriyle ayni kalir.
  const { protocol, host } = window.location;
  return `${protocol === "https:" ? "wss:" : "ws:"}//${host}/api/realtime`;
}

function connect() {
  if (socket || listeners.size === 0 || typeof window === "undefined") return;
  const ws = new WebSocket(url());
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    pingTimer = setInterval(() => send({ type: "ping" }), 25_000);
  };
  ws.onmessage = (message) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    listeners.forEach((listener) => listener(event));
  };
  ws.onclose = () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    socket = null;
    if (listeners.size === 0) return;
    const delay = Math.min(30_000, 1000 * 2 ** retry) + Math.random() * 500;
    retry += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };
}

function reconnectNow() {
  if (socket || listeners.size === 0) return;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retry = 0;
  connect();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", reconnectNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reconnectNow();
  });
}

export function sendRealtime(event: { type: "typing"; conversationId: string } | { type: "read"; conversationId: string; seq: number }) {
  send(event);
}

function send(event: object) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

/** Bilesen acik oldugu surece olaylari dinler. Son dinleyici gidince baglanti kisa bir sure sonra kapanir. */
export function useRealtime(listener: Listener) {
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => {
    const wrapped: Listener = (event) => ref.current(event);
    listeners.add(wrapped);
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
    connect();
    return () => {
      listeners.delete(wrapped);
      if (listeners.size === 0) {
        // Sayfa gecislerinde baglanti kapanip acilmasin.
        closeTimer = setTimeout(() => {
          if (listeners.size === 0) socket?.close();
        }, 3000);
      }
    };
  }, []);
}
