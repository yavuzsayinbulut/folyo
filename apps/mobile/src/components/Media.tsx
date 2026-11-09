import { IconPlayerPlayFilled, IconX } from "@tabler/icons-react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useAuthHeaders } from "@/lib/api";
import { absolute } from "@/lib/config";
import { useColors } from "@/lib/theme";
import type { Asset } from "@/lib/types";

/** API'den gelen gorsel; kitlesi kisitli gonderi ve sohbet medyasi token ile istenir. */
export function AuthImage({ path, style, contentFit = "cover" }: { path: string; style: object; contentFit?: "cover" | "contain" }) {
  const headers = useAuthHeaders();
  return <Image source={{ uri: absolute(path), headers }} style={style} contentFit={contentFit} transition={120} recyclingKey={path} />;
}

/**
 * Video sikistirilmadan oynatilir; oynatici sunucudan aralikli okuyarak ileri sarar. Oynatilana kadar yalniz
 * kapak karesi yuklenir.
 */
export function VideoPlayer({ asset, style }: { asset: Asset; style: object }) {
  const headers = useAuthHeaders();
  const [started, setStarted] = useState(false);
  if (!started) {
    return (
      <Pressable accessibilityLabel="Videoyu oynat" onPress={() => setStarted(true)} style={[style, { backgroundColor: "#000" }]}>
        {asset.posterUrl ? <AuthImage path={asset.posterUrl} style={StyleSheet.absoluteFill} /> : null}
        <View style={styles.play}>
          <IconPlayerPlayFilled size={26} color="#fff" />
        </View>
      </Pressable>
    );
  }
  return <StartedVideo uri={absolute(asset.url)} headers={headers} style={style} />;
}

function StartedVideo({ uri, headers, style }: { uri: string; headers?: Record<string, string>; style: object }) {
  const player = useVideoPlayer({ uri, headers }, (p) => p.play());
  return <VideoView player={player} style={[style, { backgroundColor: "#000" }]} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" />;
}

/** Gonderideki fotograflar/video: ızgarada hizli kopya, dokununca tam ekran orijinal kalite. */
export function PostMedia({ media, width }: { media: Asset[]; width: number }) {
  const c = useColors();
  const [open, setOpen] = useState<number | null>(null);
  if (media.length === 0) return null;
  if (media.length === 1 && media[0].kind === "VIDEO") {
    const a = media[0];
    const ratio = a.width && a.height ? Math.min(Math.max(a.width / a.height, 0.6), 1.9) : 16 / 9;
    return <VideoPlayer asset={a} style={{ width, height: width / ratio, borderRadius: 14, overflow: "hidden" }} />;
  }
  const single = media.length === 1;
  const ratio = single && media[0].width && media[0].height ? Math.min(Math.max(media[0].width / media[0].height, 0.6), 1.9) : 1;
  const cell = single ? { width, height: width / ratio } : { width: (width - 4) / 2, height: (width - 4) / 2 };
  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, borderRadius: 14, overflow: "hidden" }}>
        {media.map((asset, i) => (
          <Pressable key={asset.id} accessibilityLabel={`Fotoğrafı büyüt (${i + 1}/${media.length})`} onPress={() => setOpen(i)}>
            <AuthImage path={single ? asset.largeUrl : asset.thumbUrl} style={[cell, { backgroundColor: c.surface2 }]} />
          </Pressable>
        ))}
      </View>
      <Viewer media={media} index={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Tam ekran: orijinal kalite. Birden cok fotografta yana kaydirilir. */
export function Viewer({ media, index, onClose }: { media: Asset[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {index !== null ? (
          <FlatList
            data={media}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(a) => a.id}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) =>
              item.kind === "VIDEO" ? (
                <VideoPlayer asset={item} style={{ width, height }} />
              ) : (
                <AuthImage path={item.url} style={{ width, height }} contentFit="contain" />
              )
            }
          />
        ) : null}
        <Pressable accessibilityLabel="Kapat" onPress={onClose} style={styles.close}>
          <IconX size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  play: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  close: {
    position: "absolute",
    top: 48,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
