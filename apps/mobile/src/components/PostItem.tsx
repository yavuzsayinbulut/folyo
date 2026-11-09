import { IconCheck, IconFlag, IconHeart, IconHeartFilled, IconLock, IconMessageCircle, IconRosetteDiscountCheckFilled, IconTrash, IconUsers } from "@tabler/icons-react-native";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, Text, View, useWindowDimensions } from "react-native";
import { ApiError, useApi } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { useColors } from "@/lib/theme";
import { shortTime } from "@/lib/time";
import type { Post } from "@/lib/types";
import { PostMedia } from "./Media";
import { ReportSheet } from "./ReportSheet";
import { Avatar } from "./ui";

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]])/g;

/** Metindeki baglantilar dokunulabilir; geri kalan duz metin. */
export function LinkedText({ text, color, linkColor, size = 15 }: { text: string; color: string; linkColor: string; size?: number }) {
  const parts = text.split(URL_PATTERN);
  return (
    <Text style={{ color, fontSize: size, lineHeight: size * 1.4 }}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ color: linkColor }} onPress={() => Linking.openURL(part)}>
            {part.replace(/^https?:\/\//, "")}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export function PostItem({
  post,
  onChange,
  onDelete,
  onApprove,
  openThread = true,
}: {
  post: Post;
  onChange: (p: Post) => void;
  onDelete: (id: string) => void;
  onApprove?: (p: Post) => void;
  openThread?: boolean;
}) {
  const c = useColors();
  const api = useApi();
  const { width } = useWindowDimensions();
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const { author } = post;

  async function like() {
    const optimistic = { ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) };
    onChange(optimistic);
    try {
      onChange(await api<Post>(`/api/me/posts/${post.id}/like`, { method: post.likedByMe ? "DELETE" : "POST" }));
    } catch (e) {
      onChange(post);
      setError(e instanceof ApiError ? e.message : "Olmadı, tekrar dene");
    }
  }

  async function remove() {
    const ok = await confirm(post.replyToId ? "Yanıt silinsin mi?" : "Gönderi silinsin mi?", post.media.length > 0 ? "Fotoğraf ve videolar da kalıcı olarak silinir." : "", "Sil");
    if (!ok) return;
    try {
      await api(`/api/me/posts/${post.id}`, { method: "DELETE" });
      onDelete(post.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Silinemedi");
    }
  }

  const thread = () => openThread && router.push(`/posts/${post.replyToId ?? post.id}`);

  return (
    <Pressable onPress={thread} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: post.status === "PENDING" ? c.surface2 : c.surface }}>
      <Avatar name={author.displayName} url={author.avatarUrl} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text numberOfLines={1} style={{ color: c.ink, fontWeight: "600", fontSize: 15, flexShrink: 1 }}>
            {author.displayName}
          </Text>
          {author.verified ? <IconRosetteDiscountCheckFilled size={15} color={c.accent} accessibilityLabel="Doğrulanmış hesap" /> : null}
          {author.username ? (
            <Text numberOfLines={1} style={{ color: c.ink3, fontSize: 14, flexShrink: 2 }}>
              @{author.username}
            </Text>
          ) : null}
          <Text style={{ color: c.ink3, fontSize: 14 }}>· {shortTime(post.createdAt)}</Text>
          {post.audience === "VERIFIED" ? <IconLock size={13} color={c.ink3} accessibilityLabel="Yalnız doğrulanmışlar" /> : null}
          {post.audience === "SIGNED_IN" ? <IconUsers size={13} color={c.ink3} accessibilityLabel="Yalnız giriş yapanlar" /> : null}
        </View>
        {post.status === "PENDING" ? <Text style={{ color: c.ink3, fontSize: 12, marginTop: 2 }}>Onay bekliyor · yalnız sen ve sayfa sahibi görüyor</Text> : null}
        {post.status === "HIDDEN" ? <Text style={{ color: c.danger, fontSize: 12, marginTop: 2 }}>İnceleniyor · şikayetler nedeniyle şimdilik gizlendi</Text> : null}
        {post.body ? (
          <View style={{ marginTop: 4 }}>
            <LinkedText text={post.body} color={c.ink} linkColor={c.accent} />
          </View>
        ) : null}
        {post.media.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <PostMedia media={post.media} width={width - 16 * 2 - 42 - 12} />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 22, marginTop: 10 }}>
          {!post.replyToId ? (
            <Pressable onPress={thread} accessibilityLabel={`${post.replyCount} yanıt`} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <IconMessageCircle size={19} color={c.ink3} />
              {post.replyCount > 0 ? <Text style={{ color: c.ink3 }}>{post.replyCount}</Text> : null}
            </Pressable>
          ) : null}
          {post.status === "VISIBLE" ? (
            <Pressable onPress={like} accessibilityLabel={post.likedByMe ? "Beğeniyi geri al" : "Beğen"} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              {post.likedByMe ? <IconHeartFilled size={19} color="#f43f5e" /> : <IconHeart size={19} color={c.ink3} />}
              {post.likeCount > 0 ? <Text style={{ color: post.likedByMe ? "#f43f5e" : c.ink3 }}>{post.likeCount}</Text> : null}
            </Pressable>
          ) : null}
          {onApprove && post.status === "PENDING" ? (
            <Pressable onPress={() => onApprove(post)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <IconCheck size={17} color={c.okInk} />
              <Text style={{ color: c.okInk }}>Onayla</Text>
            </Pressable>
          ) : null}
          {!post.mine && post.status === "VISIBLE" ? (
            <Pressable onPress={() => setReporting(true)} accessibilityLabel="Şikayet et" hitSlop={8} style={{ marginLeft: "auto" }}>
              <IconFlag size={17} color={c.ink3} />
            </Pressable>
          ) : null}
          {post.canDelete ? (
            <Pressable onPress={remove} accessibilityLabel="Sil" hitSlop={8} style={!post.mine && post.status === "VISIBLE" ? undefined : { marginLeft: "auto" }}>
              <IconTrash size={18} color={c.ink3} />
            </Pressable>
          ) : null}
        </View>
        {error ? <Text style={{ color: c.danger, marginTop: 6 }}>{error}</Text> : null}
      </View>
      <ReportSheet
        request={reporting ? { target: "POST", targetId: post.id, title: post.replyToId ? "Yanıtı şikayet et" : "Gönderiyi şikayet et" } : null}
        onClose={() => setReporting(false)}
      />
    </Pressable>
  );
}
