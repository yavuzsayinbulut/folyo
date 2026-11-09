import { IconPlus } from "@tabler/icons-react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError, useApi, useUpload } from "@/lib/api";
import { absolute } from "@/lib/config";
import { useColors } from "@/lib/theme";
import type { Asset, StickerSet } from "@/lib/types";
import { BottomSheet } from "./ui";

export type StickerChoice = { sticker: string; stickerUrl: string } | { assetId: string; stickerUrl: string };

/** Hazir paketler + kendi sticker'larin (seffaf PNG/WebP). Dokunulan sticker gonderilir; kendi sticker'ina uzun basinca silinir. */
export function StickerSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (c: StickerChoice) => void }) {
  const c = useColors();
  const api = useApi();
  const upload = useUpload();
  const [set, setSet] = useState<StickerSet | null>(null);
  const [tab, setTab] = useState("mine");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || set) return;
    api<StickerSet>("/api/public/stickers").then(
      (s) => {
        setSet(s);
        if (s.mine.length === 0 && s.packs.length > 0) setTab(s.packs[0].id);
      },
      () => undefined,
    );
  }, [visible, set, api]);

  async function add() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled) return;
    const picked = result.assets[0];
    setBusy(true);
    try {
      const asset = await upload<Asset>("/api/me/stickers", { uri: picked.uri, name: picked.fileName ?? "sticker.png", type: picked.mimeType ?? "image/png" });
      setSet((s) => s && { ...s, mine: [...s.mine, asset] });
    } catch (e) {
      Alert.alert("Sticker eklenemedi", e instanceof ApiError ? e.message : "Tekrar dene");
    } finally {
      setBusy(false);
    }
  }

  function remove(asset: Asset) {
    Alert.alert("Sticker silinsin mi?", "", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () =>
          api(`/api/me/stickers/${asset.id}`, { method: "DELETE" }).then(
            () => setSet((s) => s && { ...s, mine: s.mine.filter((m) => m.id !== asset.id) }),
            () => undefined,
          ),
      },
    ]);
  }

  const pack = set?.packs.find((p) => p.id === tab);
  const cell = { width: "25%" as const, aspectRatio: 1, padding: 6 };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
        {[{ id: "mine", name: "Benim" }, ...(set?.packs ?? [])].map((p) => (
          <Pressable key={p.id} onPress={() => setTab(p.id)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, justifyContent: "center", backgroundColor: tab === p.id ? c.surface2 : "transparent" }}>
            <Text style={{ color: tab === p.id ? c.ink : c.ink2, fontWeight: tab === p.id ? "600" : "400" }}>{p.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {!set ? (
        <ActivityIndicator color={c.accent} style={{ margin: 24 }} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", minHeight: 160 }}>
          {tab === "mine" ? (
            <>
              {set.mine.map((s) => {
                const url = s.url.replace(/\/original$/, "/sticker");
                return (
                  <Pressable key={s.id} style={cell} onPress={() => onPick({ assetId: s.id, stickerUrl: url })} onLongPress={() => remove(s)}>
                    <Image source={{ uri: absolute(url) }} style={{ flex: 1 }} contentFit="contain" />
                  </Pressable>
                );
              })}
              <Pressable style={cell} onPress={add} disabled={busy} accessibilityLabel="Sticker ekle">
                <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" }}>
                  {busy ? <ActivityIndicator color={c.accent} /> : <IconPlus size={22} color={c.ink3} />}
                </View>
              </Pressable>
              <Text style={{ width: "100%", color: c.ink3, fontSize: 12, marginTop: 6 }}>Kendi sticker&apos;ın: şeffaf PNG ya da WebP, en fazla 1 MB. Silmek için uzun bas.</Text>
            </>
          ) : (
            pack?.stickers.map((s) => (
              <Pressable key={s.id} style={cell} accessibilityLabel={s.title} onPress={() => onPick({ sticker: s.id, stickerUrl: s.url })}>
                <Image source={{ uri: absolute(s.url) }} style={{ flex: 1 }} contentFit="contain" />
              </Pressable>
            ))
          )}
        </View>
      )}
    </BottomSheet>
  );
}
