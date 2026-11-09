import { IconArrowDown, IconArrowUp, IconPlus, IconTrash, IconX } from "@tabler/icons-react-native";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Platform, Pressable, Switch, Text, View } from "react-native";
import { ApiError, useApi, useAuthHeaders } from "@/lib/api";
import { absolute } from "@/lib/config";
import { confirm } from "@/lib/confirm";
import { describeCard } from "@/lib/platforms";
import { useColors } from "@/lib/theme";
import type { Card, CardSize, MediaItem } from "@/lib/types";
import { BottomSheet, PlatformBadge, Segmented } from "./ui";

const SIZE_OPTIONS: { value: CardSize; label: string }[] = [
  { value: "SMALL", label: "1×1" },
  { value: "WIDE", label: "2×1" },
  { value: "LARGE", label: "2×2" },
];

/** Bir kartin tum islemleri tek yerde: boyut, gorunurluk, siralama, galeri fotograflari, silme. */
export function CardSheet(props: {
  card: Card | null;
  canUp: boolean;
  canDown: boolean;
  onClose: () => void;
  onResize: (size: CardSize) => void;
  onToggle: () => void;
  onAudience: (audience: Card["audience"]) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  onMediaChange: (media: MediaItem[]) => void;
}) {
  const c = useColors();
  const { card } = props;
  if (!card) return <BottomSheet visible={false} onClose={props.onClose}>{null}</BottomSheet>;
  const { platform, title, subtitle } = describeCard(card);

  return (
    <BottomSheet visible onClose={props.onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <PlatformBadge platform={platform} size={40} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "700", color: c.ink }}>{title}</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, color: c.ink3 }}>{subtitle}</Text>
        </View>
      </View>

      <SheetRow label="Boyut">
        <Segmented options={SIZE_OPTIONS} value={card.size} onChange={(size) => props.onResize(size as CardSize)} />
      </SheetRow>
      <SheetRow label="Sayfada göster">
        <Switch
          value={card.visible}
          onValueChange={props.onToggle}
          trackColor={{ true: c.accent, false: c.lineStrong }}
          thumbColor="#ffffff"
          accessibilityLabel="Sayfada göster"
        />
      </SheetRow>

      {card.visible ? (
        <View style={{ paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: c.line }}>
          <Text style={{ fontSize: 15, color: c.ink, marginBottom: 8 }}>Kim görebilir</Text>
          <Segmented
            options={[
              { value: "EVERYONE" as Card["audience"], label: "Herkes" },
              { value: "SIGNED_IN" as Card["audience"], label: "Giriş" },
              { value: "VERIFIED" as Card["audience"], label: "Doğrulanmış" },
            ]}
            value={card.audience}
            onChange={props.onAudience}
          />
        </View>
      ) : null}

      {card.type === "GALLERY" ? <GalleryEditor card={card} onChange={props.onMediaChange} /> : null}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <SheetButton label="Yukarı" icon={<IconArrowUp size={18} color={c.ink} />} disabled={!props.canUp} onPress={() => props.onMove(-1)} />
        <SheetButton label="Aşağı" icon={<IconArrowDown size={18} color={c.ink} />} disabled={!props.canDown} onPress={() => props.onMove(1)} />
        <SheetButton label="Sil" danger icon={<IconTrash size={18} color={c.danger} />} onPress={props.onDelete} />
      </View>
    </BottomSheet>
  );
}

function SheetRow({ label, children }: { label: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: c.line }}>
      <Text style={{ fontSize: 15, color: c.ink }}>{label}</Text>
      {children}
    </View>
  );
}

function SheetButton(props: { label: string; icon: React.ReactNode; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => ({
        flex: 1,
        height: 48,
        borderRadius: 14,
        backgroundColor: c.surface2,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
        opacity: props.disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      {props.icon}
      <Text style={{ fontSize: 15, fontWeight: "600", color: props.danger ? c.danger : c.ink }}>{props.label}</Text>
    </Pressable>
  );
}

/** Fotograflar galeriden secilir ve sirayla yuklenir; sunucu boyutlandirir ve konum dahil tum metadata'yi siler. */
function GalleryEditor({ card, onChange }: { card: Card; onChange: (media: MediaItem[]) => void }) {
  const authHeaders = useAuthHeaders();
  const c = useColors();
  const api = useApi();
  const [status, setStatus] = useState<string | null>(null);
  const media = card.media ?? [];

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, quality: 0.9 });
    if (result.canceled) return;
    let current = media;
    for (const [i, asset] of result.assets.entries()) {
      setStatus(`Yükleniyor ${i + 1}/${result.assets.length}`);
      const form = new FormData();
      if (Platform.OS === "web" && asset.file) {
        form.append("file", asset.file);
      } else {
        // React Native FormData dosyayi { uri, name, type } nesnesiyle alir.
        form.append("file", { uri: asset.uri, name: asset.fileName ?? "photo.jpg", type: asset.mimeType ?? "image/jpeg" } as unknown as Blob);
      }
      try {
        const item = await api<MediaItem>(`/api/me/cards/${card.id}/media`, { method: "POST", form });
        current = [...current, item];
        onChange(current);
      } catch (e) {
        setStatus(e instanceof ApiError ? e.message : "Yüklenemedi");
        return;
      }
    }
    setStatus(null);
  }

  async function remove(item: MediaItem) {
    if (!(await confirm("Fotoğrafı sil", "Bu fotoğraf galeriden kaldırılacak.", "Sil"))) return;
    try {
      await api(`/api/me/media/${item.id}`, { method: "DELETE" });
      onChange(media.filter((m) => m.id !== item.id));
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Fotoğraf silinemedi");
    }
  }

  return (
    <View style={{ paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: c.line }}>
      <Text style={{ fontSize: 15, color: c.ink, marginBottom: 10 }}>Fotoğraflar</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {media.map((item) => (
          <View key={item.id}>
            <Image source={{ uri: absolute(item.url), headers: authHeaders }} style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: c.surface2 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fotoğrafı sil"
              onPress={() => remove(item)}
              hitSlop={8}
              style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
            >
              <IconX size={12} color="#fff" />
            </Pressable>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fotoğraf ekle"
          onPress={pick}
          style={{ width: 64, height: 64, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" }}
        >
          <IconPlus size={20} color={c.ink3} />
        </Pressable>
      </View>
      <Text style={{ marginTop: 6, fontSize: 12, color: status ? c.ink2 : c.ink3 }}>
        {status ?? "Konum dahil tüm fotoğraf bilgileri yüklerken silinir."}
      </Text>
    </View>
  );
}
