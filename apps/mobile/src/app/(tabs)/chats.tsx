import { IconCheck, IconChecks, IconSettings } from "@tabler/icons-react-native";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar, Segmented } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { useColors } from "@/lib/theme";
import { listTime } from "@/lib/time";
import { messagePreview as preview } from "@/lib/chat";
import type { ChatFolder, Conversation } from "@/lib/types";
import { useUnread } from "@/lib/useUnread";

const EMPTY: Record<ChatFolder, string> = {
  CHATS: "Henüz sohbetin yok. Bir sayfadaki “Mesaj gönder” kutusundan başlayabilirsin.",
  REQUESTS: "Bekleyen mesaj isteği yok.",
  ARCHIVE: "Arşivde sohbet yok.",
};

/** WhatsApp benzeri sohbet listesi: anlik guncellenir, okunmamis sayisi, tikler, "yaziyor", cevrimici noktasi. */
export default function Chats() {
  const c = useColors();
  const api = useApi();
  const { unread, refresh: refreshUnread } = useUnread();
  const [folder, setFolder] = useState<ChatFolder>("CHATS");
  const [list, setList] = useState<Conversation[] | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<Conversation[]>(`/api/me/conversations?folder=${folder}`));
    } catch {
      setList((l) => l ?? []);
    }
  }, [api, folder]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshUnread();
    }, [load, refreshUnread]),
  );

  useRealtime((event) => {
    switch (event.type) {
      case "ready":
        load();
        break;
      case "message":
        setTyping((t) => ({ ...t, [event.conversationId]: 0 }));
        if (!list?.some((x) => x.id === event.conversationId)) {
          load();
          return;
        }
        setList((l) => {
          if (!l) return l;
          const target = l.find((x) => x.id === event.conversationId)!;
          const updated = { ...target, lastMessage: event.message, lastMessageAt: event.message.createdAt, unread: event.message.mine ? target.unread : target.unread + 1 };
          return [updated, ...l.filter((x) => x.id !== event.conversationId)];
        });
        break;
      case "receipt":
        setList((l) => l && l.map((x) => (x.id === event.conversationId && x.other.userId === event.userId ? { ...x, otherDeliveredSeq: Math.max(x.otherDeliveredSeq, event.deliveredSeq), otherReadSeq: event.readSeq ?? x.otherReadSeq } : x)));
        break;
      case "typing":
        setTyping((t) => ({ ...t, [event.conversationId]: Date.now() }));
        break;
      case "presence":
        setList((l) => l && l.map((x) => (x.other.userId === event.userId ? { ...x, presence: event.hidden ? null : { online: event.online, lastSeenAt: event.lastSeenAt } } : x)));
        break;
    }
  });

  // "Yaziyor" 4 sn icinde yenilenmezse kaybolur.
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping((t) => {
        const now = Date.now();
        return Object.values(t).some((at) => at > 0 && now - at > 4000) ? Object.fromEntries(Object.entries(t).map(([k, at]) => [k, now - at > 4000 ? 0 : at])) : t;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: c.ink, letterSpacing: -0.4 }}>Sohbetler</Text>
        <Pressable accessibilityLabel="Sohbet ayarları" onPress={() => router.push("/chat-settings")} hitSlop={10} style={{ marginLeft: "auto" }}>
          <IconSettings size={22} color={c.ink2} />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <Segmented
          value={folder}
          onChange={(f) => {
            setList(null);
            setFolder(f);
          }}
          options={[
            { value: "CHATS", label: "Sohbetler" },
            { value: "REQUESTS", label: unread.requests > 0 ? `İstekler (${unread.requests})` : "İstekler" },
            { value: "ARCHIVE", label: "Arşiv" },
          ]}
        />
      </View>
      {list === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(x) => x.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={c.accent}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={<Text style={{ color: c.ink3, textAlign: "center", padding: 32 }}>{EMPTY[folder]}</Text>}
          renderItem={({ item }) => {
            const last = item.lastMessage;
            const isTyping = (typing[item.id] ?? 0) > 0;
            const read = last && item.otherReadSeq != null && last.seq <= item.otherReadSeq;
            const delivered = last && last.seq <= item.otherDeliveredSeq;
            return (
              <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? c.surface2 : "transparent" })}>
                <View>
                  <Avatar name={item.other.name} url={item.other.avatarUrl} size={52} />
                  {item.presence?.online ? <View style={{ position: "absolute", right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: "#10b981", borderWidth: 2, borderColor: c.bg }} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    <Text numberOfLines={1} style={{ flex: 1, color: c.ink, fontWeight: "600", fontSize: 16 }}>
                      {item.other.name}
                    </Text>
                    {item.lastMessageAt ? <Text style={{ color: item.unread > 0 ? c.accent : c.ink3, fontSize: 12 }}>{listTime(item.lastMessageAt)}</Text> : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    {isTyping ? (
                      <Text style={{ color: c.accent, flex: 1 }}>yazıyor…</Text>
                    ) : (
                      <>
                        {last?.mine && !last.deleted ? read ? <IconChecks size={16} color="#0ea5e9" /> : delivered ? <IconChecks size={16} color={c.ink3} /> : <IconCheck size={15} color={c.ink3} /> : null}
                        <Text numberOfLines={1} style={{ color: c.ink2, flex: 1 }}>
                          {last ? preview(last) : ""}
                        </Text>
                      </>
                    )}
                    {item.unread > 0 ? (
                      <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: c.onAccent, fontSize: 12, fontWeight: "600" }}>{item.unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
