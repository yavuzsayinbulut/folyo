import { IconQuote } from "@tabler/icons-react-native";
import { Image, Pressable, Text, useColorScheme, View } from "react-native";
import { useAuthHeaders } from "@/lib/api";
import { absolute } from "@/lib/config";
import { pageLook, type PageLook } from "@/lib/pageThemes";
import { describeCard } from "@/lib/platforms";
import { useColors } from "@/lib/theme";
import type { Card, Profile } from "@/lib/types";
import { PlatformBadge } from "./ui";

const MAX_TILES = 6;

/**
 * Ziyaretcinin gordugu bento sayfanin kucuk hali. Yalniz gorunur kartlar, ilk 6 tanesi.
 * 1x1 kart yarim genislik, 2x1 tam genislik, 2x2 tam genislik ve daha yuksek cizilir.
 */
export function PagePreview({
  cards,
  profile,
  onPressCard,
}: {
  cards: Card[];
  profile: Pick<Profile, "theme" | "accent">;
  onPressCard: (card: Card) => void;
}) {
  const c = useColors();
  // Onizleme ziyaretcinin gorecegi sablonla boyanir (secilen tema ve vurgu rengi).
  const look = pageLook(profile.theme, profile.accent, useColorScheme() === "dark");
  const visible = cards.filter((card) => card.visible);
  const shown = visible.slice(0, MAX_TILES);

  if (shown.length === 0) {
    return (
      <View style={{ borderRadius: 20, borderWidth: 1, borderStyle: "dashed", borderColor: c.lineStrong, padding: 22, alignItems: "center" }}>
        <Text style={{ color: c.ink3, fontSize: 14 }}>Kart ekledikçe sayfan burada şekillenir.</Text>
      </View>
    );
  }

  return (
    <View style={{ borderRadius: 22, backgroundColor: look.bg, borderWidth: 1, borderColor: c.line, padding: 8, gap: 8 }}>
      {packRows(shown).map((row) => (
        <View key={row.map((card) => card.id).join("-")} style={{ flexDirection: "row", gap: 8 }}>
          {row.map((card) => (
            <Tile key={card.id} card={card} look={look} onPress={() => onPressCard(card)} />
          ))}
        </View>
      ))}
      {visible.length > shown.length ? (
        <Text style={{ textAlign: "center", fontSize: 12, color: look.ink3, marginTop: 8 }}>+{visible.length - shown.length} kart daha</Text>
      ) : null}
    </View>
  );
}

/**
 * Web'deki 2 sutunlu "dense" izgaranin aynisi: 1x1 kart yalniz kalirsa, sonraki ilk 1x1 kart yanina gelir;
 * 2x1 ve 2x2 kartlar tam satir kaplar. Boylece onizleme, ziyaretcinin telefonda gordugu yerlesimle ayni olur.
 */
function packRows(cards: Card[]): Card[][] {
  const rows: Card[][] = [];
  let openRow: Card[] | null = null;
  for (const card of cards) {
    if (card.size !== "SMALL") {
      rows.push([card]);
    } else if (openRow) {
      openRow.push(card);
      openRow = null;
    } else {
      openRow = [card];
      rows.push(openRow);
    }
  }
  return rows;
}

function Tile({ card, look, onPress }: { card: Card; look: PageLook; onPress: () => void }) {
  const authHeaders = useAuthHeaders();
  const { platform, title, subtitle } = describeCard(card);
  // 1x1 kartlar satiri paylasir; satirda tek kalan 1x1 yarim genislikte kalir (web'deki bos hucre gibi).
  const sizing = card.size === "SMALL" ? ({ flex: 1, maxWidth: "50%" } as const) : ({ flex: 1 } as const);
  const height = card.size === "LARGE" ? 132 : 84;
  const cover = card.type === "GALLERY" ? card.media?.[0] : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} kartını düzenle`}
      onPress={onPress}
      style={({ pressed }) => ({
        ...sizing,
        height,
        borderRadius: look.radius,
        borderWidth: 1,
        borderColor: look.line,
        backgroundColor: look.surface,
        overflow: "hidden",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {cover ? (
        <>
          <Image source={{ uri: absolute(cover.url), headers: authHeaders }} style={{ position: "absolute", width: "100%", height: "100%" }} />
          <View style={{ position: "absolute", left: 8, bottom: 8, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text numberOfLines={1} style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{title}</Text>
          </View>
        </>
      ) : card.type === "TEXT" ? (
        <View style={{ padding: 12, gap: 4 }}>
          <IconQuote size={14} color={look.ink3} />
          <Text numberOfLines={card.size === "LARGE" ? 5 : 2} style={{ fontSize: 13, color: look.ink, lineHeight: 18 }}>{title}</Text>
        </View>
      ) : (
        <View style={{ flex: 1, padding: 12, justifyContent: "space-between" }}>
          <PlatformBadge platform={platform} size={28} look={look} />
          <View>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: look.ink }}>{title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 11, color: look.ink3 }}>{subtitle}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
