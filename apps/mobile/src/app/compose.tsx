import { IconPhotoPlus, IconX } from "@tabler/icons-react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Body, Button, Segmented } from "@/components/ui";
import { ApiError, useApi, useUpload } from "@/lib/api";
import { useColors } from "@/lib/theme";
import type { Asset, Post, PostAudience } from "@/lib/types";

const MAX_BODY = 500;
const MAX_PHOTOS = 4;

type Attachment = { key: string; uri: string; kind: "PHOTO" | "VIDEO"; progress: number; asset: Asset | null; error: string | null };

/** Yeni gonderi: metin, en fazla 4 fotograf ya da 1 video, kim gorebilir. Dosyalar secilince yuklenmeye baslar. */
export default function Compose() {
  const c = useColors();
  const api = useApi();
  const upload = useUpload();
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<PostAudience>("EVERYONE");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const length = [...body].length;
  const hasVideo = attachments.some((a) => a.kind === "VIDEO");
  const uploading = attachments.some((a) => !a.asset && !a.error);
  const canPost = !posting && !uploading && length <= MAX_BODY && (body.trim().length > 0 || attachments.some((a) => a.asset));

  const update = (key: string, change: Partial<Attachment>) => setAttachments((list) => list.map((a) => (a.key === key ? { ...a, ...change } : a)));

  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: attachments.length > 0 ? ["images"] : ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - attachments.length,
      // Kalite 1 ve duzenleme yok: dosya yeniden sikistirilmadan gelir.
      quality: 1,
      exif: false,
    });
    if (result.canceled) return;
    const assets = result.assets;
    const videos = assets.filter((a) => a.type === "video");
    if (videos.length > 0 && assets.length > 1) return setError("Video tek başına paylaşılır: en fazla 1 video ya da 4 fotoğraf");
    for (const picked of assets) {
      const video = picked.type === "video";
      const key = `${picked.uri}-${Math.random()}`;
      setAttachments((list) => [...list, { key, uri: picked.uri, kind: video ? "VIDEO" : "PHOTO", progress: 0, asset: null, error: null }]);
      const name = picked.fileName ?? (video ? "video.mp4" : "photo.jpg");
      const type = picked.mimeType ?? (video ? "video/mp4" : "image/jpeg");
      upload<Asset>(video ? "/api/me/assets/videos" : "/api/me/assets/photos", { uri: picked.uri, name, type }, { onProgress: (p) => update(key, { progress: p }) }).then(
        (asset) => update(key, { asset, progress: 1 }),
        (e) => update(key, { error: e instanceof ApiError ? e.message : "Yüklenemedi" }),
      );
    }
  }

  async function post() {
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      await api<Post>("/api/me/posts", {
        method: "POST",
        body: { body: body.trim() || null, audience, mediaIds: attachments.filter((a) => a.asset).map((a) => a.asset!.id) },
      });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Paylaşılamadı, tekrar dene");
    } finally {
      setPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={body}
          onChangeText={(t) => {
            setBody(t);
            setError(null);
          }}
          placeholder="Neler oluyor?"
          placeholderTextColor={c.ink3}
          multiline
          autoFocus
          style={{ minHeight: 120, fontSize: 17, color: c.ink, textAlignVertical: "top" }}
        />
        {attachments.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {attachments.map((a) => (
              <View key={a.key} style={{ width: attachments.length === 1 ? "100%" : "48%", aspectRatio: attachments.length === 1 ? 16 / 9 : 1, borderRadius: 12, overflow: "hidden", backgroundColor: c.surface2 }}>
                <Image source={{ uri: a.uri }} style={{ flex: 1 }} contentFit="cover" />
                {!a.asset && !a.error ? (
                  <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 5, backgroundColor: "rgba(0,0,0,0.3)" }}>
                    <View style={{ height: 5, width: `${Math.round(a.progress * 100)}%`, backgroundColor: c.accent }} />
                  </View>
                ) : null}
                {a.error ? <Text style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 6, color: "#fff", backgroundColor: "rgba(0,0,0,0.7)", fontSize: 12 }}>{a.error}</Text> : null}
                <Pressable
                  accessibilityLabel="Kaldır"
                  onPress={() => setAttachments((list) => list.filter((x) => x.key !== a.key))}
                  style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
                >
                  <IconX size={16} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            accessibilityLabel="Fotoğraf ya da video ekle"
            disabled={hasVideo || attachments.length >= MAX_PHOTOS}
            onPress={pick}
            style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.accentSoft, opacity: hasVideo || attachments.length >= MAX_PHOTOS ? 0.4 : 1 }}
          >
            <IconPhotoPlus size={22} color={c.accentInk} />
          </Pressable>
          <Text style={{ marginLeft: "auto", color: length > MAX_BODY ? c.danger : c.ink3, fontVariant: ["tabular-nums"] }}>
            {length}/{MAX_BODY}
          </Text>
        </View>
        <View>
          <Body muted style={{ marginBottom: 8, fontSize: 13 }}>
            Kim görebilir
          </Body>
          <Segmented
            value={audience}
            onChange={setAudience}
            options={[
              { value: "EVERYONE", label: "Herkes" },
              { value: "SIGNED_IN", label: "Giriş yapanlar" },
              { value: "VERIFIED", label: "Doğrulanmışlar" },
            ]}
          />
        </View>
        {error ? <Body danger>{error}</Body> : null}
        <Button label={posting ? "Paylaşılıyor…" : uploading ? "Yükleniyor…" : "Paylaş"} onPress={post} disabled={!canPost} busy={posting} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
