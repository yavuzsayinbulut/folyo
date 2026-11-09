import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useApi } from "./api";
import { useRealtime } from "./realtime";
import { useSession } from "./session";
import type { ChatUnread } from "./types";

type UnreadState = { unread: ChatUnread; refresh: () => void };

const UnreadContext = createContext<UnreadState>({ unread: { chats: 0, requests: 0 }, refresh: () => undefined });

/** Okunmamis sohbet sayisi: sekme rozeti ve sohbet listesi ayni degeri paylasir. Yeni mesajda, on plana gelince ve dakikada bir. */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { token } = useSession();
  const [unread, setUnread] = useState<ChatUnread>({ chats: 0, requests: 0 });

  const refresh = useCallback(() => {
    if (token) api<ChatUnread>("/api/me/conversations/unread").then(setUnread, () => undefined);
  }, [api, token]);

  useRealtime((event) => {
    if (event.type === "message" || event.type === "ready") refresh();
  });

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);

  const value = useMemo(() => ({ unread, refresh }), [unread, refresh]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadState {
  return useContext(UnreadContext);
}
