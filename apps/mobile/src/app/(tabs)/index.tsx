import { IconChevronRight, IconEyeOff, IconPlus, IconWorld } from "@tabler/icons-react-native";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CardSheet } from "@/components/CardSheet";
import { PagePreview } from "@/components/PagePreview";
import { Avatar, Body, Button, Field, PlatformBadge, SectionHeader, Title } from "@/components/ui";
import { ApiError, useApi } from "@/lib/api";
import { WEB_URL } from "@/lib/config";
import { confirm } from "@/lib/confirm";
import { describeCard } from "@/lib/platforms";
import { useColors } from "@/lib/theme";
import type { Card, CardSize, Profile } from "@/lib/types";
import { useMeAndCards } from "@/lib/useMe";
import type { WidgetSummary } from "@/lib/useWidgetSync";

const SIZE_LABEL: Record<CardSize, string> = { SMALL: "1×1", WIDE: "2×1", LARGE: "2×2" };

export default function PageTab() {
  const c = useColors();
  const api = useApi();
  const { me, setMe, cards, setCards, error, reload } = useMeAndCards();
  const [summary, setSummary] = useState<WidgetSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<WidgetSummary>("/api/me/widget").then(setSummary, () => setSummary(null));
    }, [api]),
  );

  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "İşlem yapılamadı");
      await reload();
    }
  }

  const replace = (updated: Card) => setCards((list) => list?.map((card) => (card.id === updated.id ? updated : card)) ?? null);

  /** Yeni sira hemen gosterilir; tum liste tek istekte yazilir, hata olursa sunucudaki sira geri yuklenir. */
  const move = (card: Card, delta: -1 | 1) =>
    run(async () => {
      if (!cards) return;
      const index = cards.findIndex((item) => item.id === card.id);
      const next = [...cards];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      setCards(next);
      setCards(await api<Card[]>("/api/me/cards/order", { method: "PUT", body: { cardIds: next.map((item) => item.id) } }));
    });

  const patch = (card: Card, body: Partial<Pick<Card, "size" | "visible">>) =>
    run(async () => replace(await api<Card>(`/api/me/cards/${card.id}`, { method: "PATCH", body })));

  const remove = (card: Card) =>
    run(async () => {
      const { title } = describeCard(card);
      if (!(await confirm("Kartı sil", `"${title}" kartı sayfandan kaldırılacak.`, "Sil"))) return;
      setSelectedId(null);
      await api(`/api/me/cards/${card.id}`, { method: "DELETE" });
      setCards((list) => list?.filter((item) => item.id !== card.id) ?? null);
    });

  if (!me || !cards) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        {error ? (
          <View style={{ alignItems: "center", gap: 14, paddingHorizontal: 32 }}>
            <Body danger style={{ textAlign: "center" }}>{error}</Body>
            <Button label="Tekrar dene" variant="secondary" onPress={reload} />
          </View>
        ) : (
          <ActivityIndicator color={c.accent} />
        )}
      </SafeAreaView>
    );
  }

  if (!me.profile) {
    return <ClaimProfile defaultName={me.user.name} onClaimed={(profile) => setMe({ ...me, profile })} />;
  }

  const profile = me.profile;
  const selectedIndex = cards.findIndex((card) => card.id === selectedId);
  const selected = selectedIndex >= 0 ? cards[selectedIndex] : null;
  const hiddenCount = cards.filter((card) => !card.visible).length;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <Avatar name={profile.displayName} url={me.user.avatarUrl} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 24, fontWeight: "700", color: c.ink, letterSpacing: -0.4 }}>
              {profile.displayName}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 14, color: c.ink3 }}>folyo.app/{profile.username}</Text>
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Sayfanı tarayıcıda aç"
            onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/${profile.username}`)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              height: 38,
              paddingHorizontal: 14,
              borderRadius: 19,
              backgroundColor: c.accentSoft,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <IconWorld size={16} color={c.accentInk} />
            <Text style={{ color: c.accentInk, fontWeight: "600" }}>Gör</Text>
          </Pressable>
        </View>

        {summary ? <WeekStrip summary={summary} /> : null}

        {actionError ? <Body danger style={{ marginBottom: 10 }}>{actionError}</Body> : null}

        <SectionHeader title="Sayfan" detail={hiddenCount > 0 ? `· ${hiddenCount} gizli kart` : undefined} />
        <PagePreview cards={cards} profile={profile} onPressCard={(card) => setSelectedId(card.id)} />

        <SectionHeader
          title="Kartlar"
          detail={`· ${cards.length}`}
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kart ekle"
              onPress={() => router.push("/add-card")}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}
            >
              <IconPlus size={16} color={c.accent} />
              <Text style={{ color: c.accent, fontWeight: "600" }}>Ekle</Text>
            </Pressable>
          }
        />
        <View style={{ borderRadius: 18, backgroundColor: c.surface, overflow: "hidden" }}>
          {cards.length === 0 ? (
            <View style={{ padding: 18, gap: 12 }}>
              <Body muted>Henüz kart yok. Instagram, GitHub ya da bir yazıyla başla.</Body>
              <Button label="İlk kartını ekle" icon={<IconPlus size={18} color={c.onAccent} />} onPress={() => router.push("/add-card")} />
            </View>
          ) : (
            cards.map((card, index) => (
              <CardRow key={card.id} card={card} last={index === cards.length - 1} onPress={() => setSelectedId(card.id)} />
            ))
          )}
        </View>
      </ScrollView>

      <CardSheet
        card={selected}
        canUp={selectedIndex > 0}
        canDown={selectedIndex >= 0 && selectedIndex < cards.length - 1}
        onClose={() => setSelectedId(null)}
        onResize={(size) => selected && patch(selected, { size })}
        onToggle={() => selected && patch(selected, { visible: !selected.visible })}
        onMove={(delta) => selected && move(selected, delta)}
        onDelete={() => selected && remove(selected)}
        onMediaChange={(media) => selected && replace({ ...selected, media })}
      />
    </SafeAreaView>
  );
}

/** Bu haftanin ziyaretcisi, onceki haftaya gore degisim ve 7 gunluk mini cubuklar. Dokununca istatistige gider. */
function WeekStrip({ summary }: { summary: WidgetSummary }) {
  const c = useColors();
  const max = Math.max(1, ...summary.last7Days);
  const change =
    summary.previousWeekVisitors === 0
      ? null
      : Math.round(((summary.weekVisitors - summary.previousWeekVisitors) / summary.previousWeekVisitors) * 100);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Bu hafta ${summary.weekVisitors} ziyaretçi, istatistiğe git`}
      onPress={() => router.push("/stats")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 14,
        borderRadius: 18,
        backgroundColor: c.surface,
        marginBottom: 14,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: c.ink3 }}>Son 7 gün</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: "700", color: c.ink, fontVariant: ["tabular-nums"] }}>{summary.weekVisitors}</Text>
          <Text style={{ fontSize: 14, color: c.ink2 }}>ziyaretçi</Text>
        </View>
        {change !== null ? (
          <View
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 10,
              backgroundColor: change >= 0 ? c.okSoft : c.surface2,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: change >= 0 ? c.okInk : c.danger }}>
              {change >= 0 ? "↑" : "↓"} %{Math.abs(change)} geçen haftaya göre
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 44 }}>
        {summary.last7Days.map((value, i) => (
          <View
            key={i}
            style={{
              width: 8,
              height: Math.max(3, Math.round((value / max) * 44)),
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              backgroundColor: c.chart,
              opacity: i === summary.last7Days.length - 1 ? 1 : 0.55,
            }}
          />
        ))}
      </View>
      <IconChevronRight size={18} color={c.ink3} />
    </Pressable>
  );
}

function CardRow({ card, last, onPress }: { card: Card; last: boolean; onPress: () => void }) {
  const c = useColors();
  const { platform, title, subtitle } = describeCard(card);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${SIZE_LABEL[card.size]}${card.visible ? "" : ", gizli"}. Düzenle`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: pressed ? c.surface2 : "transparent",
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: c.line,
      })}
    >
      <View style={{ opacity: card.visible ? 1 : 0.45 }}>
        <PlatformBadge platform={platform} size={36} />
      </View>
      <View style={{ flex: 1, minWidth: 0, opacity: card.visible ? 1 : 0.55 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: c.ink }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: c.ink3 }}>{subtitle}</Text>
      </View>
      {card.visible ? null : <IconEyeOff size={16} color={c.ink3} />}
      <View style={{ paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: c.accentSoft, justifyContent: "center" }}>
        <Text style={{ fontSize: 12, color: c.accentInk }}>{SIZE_LABEL[card.size]}</Text>
      </View>
      <IconChevronRight size={18} color={c.ink3} />
    </Pressable>
  );
}

function ClaimProfile({ defaultName, onClaimed }: { defaultName: string; onClaimed: (profile: Profile) => void }) {
  const c = useColors();
  const api = useApi();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim()) return setError("Bir kullanıcı adı yaz");
    setBusy(true);
    setError(null);
    try {
      onClaimed(await api<Profile>("/api/me/profile", { method: "POST", body: { username, displayName } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sayfa açılamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: 16 }}>
      <Title subtitle="Adresini seç, sonra kartlarını ekle.">Sayfanı aç</Title>
      <Field label="Adresin (folyo.app/…)" value={username} onChangeText={setUsername} placeholder="adin" />
      <Field label="Görünen ad" value={displayName} onChangeText={setDisplayName} maxLength={60} autoCapitalize="words" />
      {error ? <Body danger style={{ marginBottom: 10 }}>{error}</Body> : null}
      <Button label="Sayfamı oluştur" onPress={submit} busy={busy} />
    </SafeAreaView>
  );
}
