import { IconSend } from "@tabler/icons-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PostItem } from "@/components/PostItem";
import { ApiError, useApi } from "@/lib/api";
import { useColors } from "@/lib/theme";
import type { Interaction, Post, PostThread } from "@/lib/types";

const NOTICE: Partial<Record<Interaction, string>> = {
  VERIFY: "Yanıt yazmak için hesabını doğrula (Profil › Güvenlik).",
  BLOCKED: "Bu gönderiye yanıt yazamazsın.",
  CLOSED: "Sayfa sahibi yanıtları kapattı.",
};

/** Gonderi ve yanitlari; yanit kurali sayfa sahibinin yorum ayarindan gelir. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const [thread, setThread] = useState<PostThread | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<PostThread>(`/api/public/posts/${id}`).then(setThread, (e) => setFailed(e instanceof ApiError && e.status === 404 ? "Gönderi bulunamadı ya da görme iznin yok." : "Yüklenemedi"));
  }, [api, id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!thread) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
        {failed ? <Text style={{ color: c.ink2, textAlign: "center" }}>{failed}</Text> : <ActivityIndicator color={c.accent} />}
      </View>
    );
  }

  const { post, replyInteraction } = thread;
  const canReply = replyInteraction === "ALLOWED" || replyInteraction === "OWNER";
  const setPost = (p: Post) => setThread((t) => t && { ...t, post: p });
  const setReplies = (fn: (r: Post[]) => Post[]) => setThread((t) => t && { ...t, replies: fn(t.replies) });

  async function send() {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      const created = await api<Post>("/api/me/posts", { method: "POST", body: { replyToId: post.id, body: text } });
      setReply("");
      setReplies((r) => [...r, created]);
      if (created.status === "VISIBLE") setPost({ ...post, replyCount: post.replyCount + 1 });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gönderilemedi");
    } finally {
      setSending(false);
    }
  }

  async function approve(r: Post) {
    try {
      const approved = await api<Post>(`/api/me/posts/${r.id}/approve`, { method: "POST" });
      setReplies((list) => list.map((x) => (x.id === approved.id ? approved : x)));
      setPost({ ...post, replyCount: post.replyCount + 1 });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Onaylanamadı");
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={thread.replies}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={
          <View style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
            <PostItem post={post} openThread={false} onChange={setPost} onDelete={() => router.back()} />
            {thread.repliesNeedApproval && replyInteraction === "ALLOWED" ? (
              <Text style={{ color: c.ink3, fontSize: 12, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.surface }}>
                Yanıtın sayfa sahibi onaylayınca herkese görünür.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <PostItem
            post={item}
            openThread={false}
            onChange={(p) => setReplies((list) => list.map((x) => (x.id === p.id ? p : x)))}
            onDelete={(rid) => {
              setReplies((list) => list.filter((x) => x.id !== rid));
              if (item.status === "VISIBLE") setPost({ ...post, replyCount: Math.max(0, post.replyCount - 1) });
            }}
            onApprove={post.mine ? approve : undefined}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line }} />}
        ListEmptyComponent={<Text style={{ color: c.ink3, textAlign: "center", padding: 24 }}>Henüz yanıt yok.</Text>}
      />
      {error ? <Text style={{ color: c.danger, paddingHorizontal: 16, paddingVertical: 6 }}>{error}</Text> : null}
      {canReply ? (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder="Yanıt yaz"
            placeholderTextColor={c.ink3}
            multiline
            maxLength={500}
            style={{ flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 12, borderWidth: 1, borderColor: c.lineStrong, paddingHorizontal: 12, paddingVertical: 10, color: c.ink, fontSize: 15 }}
          />
          <Pressable accessibilityLabel="Yanıtla" onPress={send} disabled={sending || !reply.trim()} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", opacity: sending || !reply.trim() ? 0.4 : 1 }}>
            <IconSend size={19} color={c.onAccent} />
          </Pressable>
        </View>
      ) : NOTICE[replyInteraction] ? (
        <Text style={{ color: c.ink2, padding: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>{NOTICE[replyInteraction]}</Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}
