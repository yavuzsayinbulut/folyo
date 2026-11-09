import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Avatar, Body, Panel, Screen, SectionHeader } from "@/components/ui";
import { ApiError, useApi } from "@/lib/api";
import { useColors } from "@/lib/theme";
import type { BlockedUser, ChatSettings, LastSeenAudience } from "@/lib/types";

const LAST_SEEN: { value: LastSeenAudience; label: string; hint: string }[] = [
  { value: "EVERYONE", label: "Herkes", hint: "Sohbet ettiğin herkes çevrimiçi olduğunu ve son görülmeni görür." },
  { value: "CHATS", label: "Yalnız yazıştıklarım", hint: "Yalnız karşılıklı mesajlaştığın kişiler görür." },
  { value: "NOBODY", label: "Hiç kimse", hint: "Kimse görmez; sen de başkalarınınkini göremezsin." },
];

/** Son gorulme, okundu bilgisi (mavi tik) ve engellenenler. */
export default function ChatSettingsScreen() {
  const c = useColors();
  const api = useApi();
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ChatSettings>("/api/me/chat-settings").then(setSettings, () => setError("Ayarlar yüklenemedi"));
    api<BlockedUser[]>("/api/me/blocks").then(setBlocked, () => setBlocked([]));
  }, [api]);

  async function save(next: ChatSettings) {
    const previous = settings;
    setSettings(next);
    try {
      await api("/api/me/chat-settings", { method: "PUT", body: next });
      setError(null);
    } catch (e) {
      setSettings(previous);
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi");
    }
  }

  async function unblock(user: BlockedUser) {
    try {
      await api(`/api/me/blocks/${user.userId}`, { method: "DELETE" });
      setBlocked((list) => list && list.filter((b) => b.userId !== user.userId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Engel kaldırılamadı");
    }
  }

  return (
    <Screen underHeader>
      <SectionHeader title="Çevrimiçi ve son görülme" />
      <Panel>
        {LAST_SEEN.map((option, i) => {
          const active = settings?.lastSeenAudience === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              disabled={!settings}
              onPress={() => settings && save({ ...settings, lastSeenAudience: option.value })}
              style={{ flexDirection: "row", gap: 12, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? c.accent : c.lineStrong, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontSize: 15 }}>{option.label}</Text>
                <Text style={{ color: c.ink3, fontSize: 13 }}>{option.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </Panel>
      <Panel>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.ink, fontSize: 15 }}>Okundu bilgisi (mavi tik)</Text>
            <Text style={{ color: c.ink3, fontSize: 13 }}>Kapatırsan karşı taraf okuduğunu görmez; sen de onlarınkini göremezsin.</Text>
          </View>
          <Switch value={settings?.readReceipts ?? true} disabled={!settings} onValueChange={(v) => {
              if (settings) save({ ...settings, readReceipts: v });
            }} trackColor={{ true: c.accent }} />
        </View>
      </Panel>
      <SectionHeader title="Engellenenler" />
      <Panel>
        {!blocked ? (
          <Body muted>Yükleniyor…</Body>
        ) : blocked.length === 0 ? (
          <Body muted>Kimseyi engellemedin.</Body>
        ) : (
          blocked.map((b) => (
            <View key={b.userId} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
              <Avatar name={b.name} url={b.avatarUrl} size={36} />
              <Text style={{ flex: 1, color: c.ink }} numberOfLines={1}>
                {b.name}
              </Text>
              <Pressable onPress={() => unblock(b)} style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, borderWidth: 1, borderColor: c.lineStrong, justifyContent: "center" }}>
                <Text style={{ color: c.ink }}>Engeli kaldır</Text>
              </Pressable>
            </View>
          ))
        )}
      </Panel>
      {error ? <Body danger>{error}</Body> : null}
    </Screen>
  );
}
