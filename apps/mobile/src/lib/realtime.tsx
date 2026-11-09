import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { AppState } from "react-native";
import { API_URL } from "./config";
import { useSession } from "./session";
import type { RealtimeEvent } from "./types";

type Listener = (event: RealtimeEvent) => void;
type Realtime = {
  subscribe: (listener: Listener) => () => void;
  send: (event: { type: "typing"; conversationId: string } | { type: "read"; conversationId: string; seq: number }) => void;
};

const RealtimeContext = createContext<Realtime>({ subscribe: () => () => undefined, send: () => undefined });

/**
 * Uygulama on plandayken tek WebSocket: anlik mesaj, tik, "yaziyor", cevrimici. Arka plana gecince kapatilir
 * (kisi cevrimdisi gorunur, yeni mesaj bildirim olarak gelir). Koparsa artan araliklarla yeniden baglanir;
 * her baglantida "ready" gelir ve ekranlar kacirdiklarini HTTP ile tazeler.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token } = useSession();
  const listeners = useRef(new Set<Listener>());
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let active = AppState.currentState === "active";
    let disposed = false;

    function connect() {
      if (disposed || !active || socket.current) return;
      const url = API_URL.replace(/^http/, "ws") + "/api/realtime";
      // React Native WebSocket ucuncu parametrede baslik kabul eder; tarayicidaki gibi Origin gonderilmez.
      const ws = new (WebSocket as unknown as new (url: string, protocols: string[] | null, options: { headers: Record<string, string> }) => WebSocket)(
        url,
        null,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      socket.current = ws;
      ws.onopen = () => {
        retry = 0;
        pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25_000);
      };
      ws.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as RealtimeEvent;
          listeners.current.forEach((listener) => listener(event));
        } catch {
          // bozuk olay yok sayilir
        }
      };
      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (socket.current === ws) socket.current = null;
        if (disposed || !active) return;
        const delay = Math.min(30_000, 1000 * 2 ** retry);
        retry += 1;
        retryTimer = setTimeout(connect, delay);
      };
    }

    const subscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      if (active) {
        if (retryTimer) clearTimeout(retryTimer);
        retry = 0;
        connect();
      } else {
        socket.current?.close();
      }
    });
    connect();
    return () => {
      disposed = true;
      subscription.remove();
      if (retryTimer) clearTimeout(retryTimer);
      socket.current?.close();
      socket.current = null;
    };
  }, [token]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const send = useCallback<Realtime["send"]>((event) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }, []);

  const value = useMemo(() => ({ subscribe, send }), [subscribe, send]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Ekran acik oldugu surece olaylari dinler. */
export function useRealtime(listener: Listener) {
  const { subscribe } = useContext(RealtimeContext);
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => subscribe((event) => ref.current(event)), [subscribe]);
}

export function useRealtimeSend() {
  return useContext(RealtimeContext).send;
}
