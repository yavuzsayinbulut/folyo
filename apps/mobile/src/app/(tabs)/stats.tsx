import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Body, Panel, PlatformBadge, Screen, Segmented, Title } from "@/components/ui";
import { useApi } from "@/lib/api";
import { describeCard } from "@/lib/platforms";
import { useColors } from "@/lib/theme";
import type { Stats } from "@/lib/types";

const number = new Intl.NumberFormat("tr-TR");
const shortDay = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default function StatsTab() {
  const api = useApi();
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<Stats>(`/api/me/stats?days=${days}`).then(
        (result) => {
          setStats(result);
          setError(null);
        },
        (e) => setError(e instanceof Error ? e.message : "Yüklenemedi"),
      );
    }, [api, days]),
  );

  return (
    <Screen>
      <Title subtitle="Sen ve botlar sayılmaz. Ziyaretçi bilgisi saklanmaz.">İstatistik</Title>
      <View style={{ marginBottom: 14 }}>
        <Segmented
          options={[
            { value: 7, label: "7 gün" },
            { value: 30, label: "30 gün" },
            { value: 90, label: "90 gün" },
          ]}
          value={days}
          onChange={(value) => setDays(value as 7 | 30 | 90)}
        />
      </View>
      {error ? <Body danger>{error}</Body> : null}
      {stats ? (
        <>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            <Tile label="Görüntülenme" value={stats.totals.views} previous={stats.previous.views} />
            <Tile label="Ziyaretçi" value={stats.totals.visitors} previous={stats.previous.visitors} />
            <Tile label="Tıklama" value={stats.totals.clicks} previous={stats.previous.clicks} />
          </View>
          <Text style={{ marginTop: -8, marginBottom: 14, fontSize: 12, color: "#888780" }}>Değişim: önceki {stats.days} güne göre</Text>
          <VisitorChart series={stats.series} />
          <TopCards stats={stats} />
        </>
      ) : null}
    </Screen>
  );
}

function Tile({ label, value, previous }: { label: string; value: number; previous: number }) {
  const c = useColors();
  const change = previous === 0 ? null : Math.round(((value - previous) / previous) * 100);
  const color = change === null || change === 0 ? c.ink3 : change > 0 ? c.okInk : c.danger;
  const text = change === null ? "—" : change > 0 ? `↑ %${change}` : change < 0 ? `↓ %${Math.abs(change)}` : "değişim yok";
  return (
    <Panel style={{ flex: 1, padding: 12, marginBottom: 0 }}>
      <Text style={{ fontSize: 12, color: c.ink2 }}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: "700", color: c.ink, marginTop: 2, fontVariant: ["tabular-nums"] }}>{number.format(value)}</Text>
      <Text style={{ fontSize: 12, color, marginTop: 2 }}>{text}</Text>
    </Panel>
  );
}

/** Tek seri, tek renk. Dokunulan cubugun gunu ve degerleri ustte yazar (mobilde hover yok). */
function VisitorChart({ series }: { series: Stats["series"] }) {
  const c = useColors();
  const [selected, setSelected] = useState(series.length - 1);
  const max = Math.max(1, ...series.map((d) => d.visitors));
  const point = series[Math.min(selected, series.length - 1)];
  const labelEvery = series.length <= 7 ? 1 : series.length <= 30 ? 7 : 15;

  return (
    <Panel>
      <Text style={{ fontSize: 15, fontWeight: "600", color: c.ink }}>Günlük ziyaretçi</Text>
      <Text style={{ fontSize: 13, color: c.ink2, marginTop: 2, marginBottom: 12 }}>
        {longDay.format(new Date(point.day))}: {point.visitors} ziyaretçi · {point.views} görüntülenme
      </Text>
      <View style={{ height: 150, flexDirection: "row", alignItems: "flex-end", gap: 2, borderBottomWidth: 0.5, borderBottomColor: c.line }}>
        {series.map((d, i) => (
          <Pressable
            key={d.day}
            accessibilityRole="button"
            accessibilityLabel={`${longDay.format(new Date(d.day))}: ${d.visitors} ziyaretçi`}
            onPress={() => setSelected(i)}
            style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 24,
                height: `${(d.visitors / max) * 100}%`,
                minHeight: d.visitors > 0 ? 2 : 0,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: c.chart,
                opacity: i === selected ? 1 : 0.55,
              }}
            />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {series.map((d, i) => (
          <Text key={d.day} numberOfLines={1} style={{ flex: 1, fontSize: 10, color: c.ink3, textAlign: "center" }}>
            {(series.length - 1 - i) % labelEvery === 0 ? shortDay.format(new Date(d.day)) : ""}
          </Text>
        ))}
      </View>
    </Panel>
  );
}

function TopCards({ stats }: { stats: Stats }) {
  const c = useColors();
  if (stats.topCards.length === 0) return <Body muted>Bu dönemde kartlarına henüz tıklanmadı.</Body>;
  const max = stats.topCards[0].clicks;
  return (
    <Panel>
      <Text style={{ fontSize: 15, fontWeight: "600", color: c.ink, marginBottom: 10 }}>En çok tıklanan</Text>
      {stats.topCards.map((card) => {
        const { platform, title } = describeCard(card);
        return (
          <View key={card.cardId} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <PlatformBadge platform={platform} size={30} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: c.ink }}>{title}</Text>
                <Text style={{ fontSize: 14, color: c.ink, fontVariant: ["tabular-nums"] }}>{number.format(card.clicks)}</Text>
              </View>
              <View style={{ height: 5, borderRadius: 3, backgroundColor: c.accentSoft, marginTop: 4 }}>
                <View style={{ height: 5, borderRadius: 3, width: `${(card.clicks / max) * 100}%`, backgroundColor: c.chart }} />
              </View>
            </View>
          </View>
        );
      })}
    </Panel>
  );
}
