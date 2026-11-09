import { IconCheck, IconChecks, IconClock, IconDotsVertical, IconMoodSmile, IconPaperclip, IconSend, IconX } from "@tabler/icons-react-native";
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Alert, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthImage, VideoPlayer, Viewer } from "@/components/Media";
import { LinkedText } from "@/components/PostItem";
import { ReportSheet, type ReportRequest } from "@/components/ReportSheet";
import { StickerSheet, type StickerChoice } from "@/components/StickerSheet";
import { Avatar } from "@/components/ui";
import { ApiError, useApi, useUpload } from "@/lib/api";
import { absolute } from "@/lib/config";
import { useRealtime, useRealtimeSend } from "@/lib/realtime";
import { useColors } from "@/lib/theme";
import { clockTime, dayLabel, lastSeen, sameDay } from "@/lib/time";
import type { Asset, ChatMessage, ChatThread, Conversation, MessageKind } from "@/lib/types";
import { useUnread } from "@/lib/useUnread";

type Outgoing = { kind: MessageKind; body?: string | null; asset?: Asset | null; assetId?: string; sticker?: string; stickerUrl?: string };
type Local = ChatMessage & { pending?: boolean; failed?: boolean; clientId?: string; retry?: Outgoing };
type Pending = { uri: string; kind: "PHOTO" | "VIDEO"; progress: number; asset: Asset | null };

const DELETE_WINDOW_MS = 48 * 3600 * 1000;
let localIds = -1;

/** Sira numarasina gore tekillestirilir: ayni mesaj hem HTTP yanitindan hem anlik olaydan gelebilir. Yeniden eskiye. */
function merge(list: Local[], incoming: Local[]): Local[] {
  const byId = new Map<number, Local>();
  for (const m of [...list, ...incoming]) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (b.pending || b.failed ? 1 : 0) - (a.pending || a.failed ? 1 : 0) || b.seq - a.seq || b.id - a.id);
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const api = useApi();
  const upload = useUpload();
  const send = useRealtimeSend();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { refresh: refreshUnread } = useUnread();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Local[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [typingAt, setTypingAt] = useState(0);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [stickers, setStickers] = useState(false);
  const [viewer, setViewer] = useState<Asset | null>(null);
  const [report, setReport] = useState<ReportRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastRead = useRef(0);
  const lastTyping = useRef(0);
  const focused = useRef(false);

  const load = useCallback(() => {
    api<ChatThread>(`/api/me/conversations/${id}`).then(
      (thread) => {
        setConversation(thread.conversation);
        setMessages((list) => merge(list.filter((m) => m.pending || m.failed), thread.messages));
        setNextBefore(thread.nextBefore);
      },
      (e) => setFailed(e instanceof ApiError && e.status === 404 ? "Bu sohbet bulunamadı." : "Yüklenemedi"),
    );
  }, [api, id]);

  useEffect(() => {
    load();
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  /** Ekran acik ve uygulama on plandaysa karsi tarafin son mesajina kadar okundu (karsi tarafa mavi tik). */
  const markRead = useCallback(() => {
    if (!focused.current || AppState.currentState !== "active") return;
    const lastIncoming = messages.find((m) => !m.mine && m.id > 0);
    if (!lastIncoming || lastIncoming.seq <= lastRead.current) return;
    lastRead.current = lastIncoming.seq;
    api(`/api/me/conversations/${id}/read`, { method: "POST", body: { seq: lastIncoming.seq } }).then(refreshUnread, () => (lastRead.current = 0));
  }, [api, id, messages, refreshUnread]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      markRead();
      const subscription = AppState.addEventListener("change", (s) => s === "active" && markRead());
      return () => {
        focused.current = false;
        subscription.remove();
      };
    }, [markRead]),
  );

  useRealtime((event) => {
    if (event.type === "ready") return load();
    if (!("conversationId" in event) || event.conversationId !== id) {
      if (event.type === "presence" && conversation && event.userId === conversation.other.userId) {
        setConversation({ ...conversation, presence: event.hidden ? null : { online: event.online, lastSeenAt: event.lastSeenAt } });
      }
      return;
    }
    switch (event.type) {
      case "message":
        setMessages((list) => merge(list, [event.message]));
        if (!event.message.mine) setTypingAt(0);
        break;
      case "receipt":
        setConversation((cv) => (cv && event.userId === cv.other.userId ? { ...cv, otherDeliveredSeq: Math.max(cv.otherDeliveredSeq, event.deliveredSeq), otherReadSeq: event.readSeq ?? cv.otherReadSeq } : cv));
        break;
      case "typing":
        setTypingAt(Date.now());
        break;
      case "deleted":
        setMessages((list) => list.map((m) => (m.id === event.messageId ? { ...m, deleted: true, body: null, asset: null, stickerUrl: null } : m)));
        break;
    }
  });

  useEffect(() => {
    if (!typingAt) return;
    const timer = setTimeout(() => setTypingAt(0), 4000);
    return () => clearTimeout(timer);
  }, [typingAt]);

  async function older() {
    if (nextBefore == null) return;
    try {
      const thread = await api<ChatThread>(`/api/me/conversations/${id}?before=${nextBefore}`);
      setMessages((list) => merge(list, thread.messages));
      setNextBefore(thread.nextBefore);
    } catch {
      // bir sonraki kaydirmada tekrar denenir
    }
  }

  async function deliver(outgoing: Outgoing, retryOf?: Local) {
    const clientId = retryOf?.clientId ?? Crypto.randomUUID();
    const local: Local = retryOf
      ? { ...retryOf, pending: true, failed: false }
      : {
          id: localIds--,
          seq: Number.MAX_SAFE_INTEGER,
          senderId: "",
          mine: true,
          kind: outgoing.kind,
          body: outgoing.body ?? null,
          sticker: outgoing.sticker ?? null,
          stickerUrl: outgoing.stickerUrl ?? null,
          asset: outgoing.asset ?? null,
          createdAt: new Date().toISOString(),
          deleted: false,
          pending: true,
          clientId,
          retry: outgoing,
        };
    setMessages((list) => merge(list.filter((m) => m.id !== local.id), [local]));
    try {
      const saved = await api<ChatMessage>(`/api/me/conversations/${id}/messages`, {
        method: "POST",
        body: { clientId, kind: outgoing.kind, body: outgoing.body, assetId: outgoing.asset?.id ?? outgoing.assetId, sticker: outgoing.sticker },
      });
      setMessages((list) => merge(list.filter((m) => m.id !== local.id), [saved]));
      if (conversation && conversation.state !== "ACTIVE") setConversation({ ...conversation, state: "ACTIVE" });
    } catch (e) {
      setMessages((list) => list.map((m) => (m.id === local.id ? { ...m, pending: false, failed: true } : m)));
      setError(e instanceof ApiError ? e.message : "Mesaj gönderilemedi");
    }
  }

  function submit() {
    const body = text.trim();
    if (pending) {
      if (!pending.asset) return;
      deliver({ kind: pending.kind, asset: pending.asset, body: body || null });
      setPending(null);
      setText("");
      return;
    }
    if (!body) return;
    deliver({ kind: "TEXT", body });
    setText("");
  }

  async function attach() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 1, exif: false });
    if (result.canceled) return;
    const picked = result.assets[0];
    const video = picked.type === "video";
    const next: Pending = { uri: picked.uri, kind: video ? "VIDEO" : "PHOTO", progress: 0, asset: null };
    setPending(next);
    try {
      const asset = await upload<Asset>(
        video ? "/api/me/assets/videos" : "/api/me/assets/photos",
        { uri: picked.uri, name: picked.fileName ?? (video ? "video.mp4" : "photo.jpg"), type: picked.mimeType ?? (video ? "video/mp4" : "image/jpeg") },
        { onProgress: (progress) => setPending((p) => (p && p.uri === next.uri ? { ...p, progress } : p)) },
      );
      setPending((p) => (p && p.uri === next.uri ? { ...p, asset, progress: 1 } : p));
    } catch (e) {
      setPending(null);
      setError(e instanceof ApiError ? e.message : "Yüklenemedi");
    }
  }

  function onType(value: string) {
    setText(value);
    if (value && Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now();
      send({ type: "typing", conversationId: id });
    }
  }

  function messageMenu(m: Local) {
    if (m.failed && m.retry) return deliver(m.retry, m);
    if (!m.mine && !m.deleted && m.id > 0) {
      return Alert.alert("Mesaj", undefined, [
        { text: "Şikayet et", style: "destructive", onPress: () => setReport({ target: "MESSAGE", targetId: String(m.id), title: "Mesajı şikayet et" }) },
        { text: "Vazgeç", style: "cancel" },
      ]);
    }
    const canDelete = m.mine && !m.deleted && !m.pending && now - new Date(m.createdAt).getTime() < DELETE_WINDOW_MS;
    if (!canDelete) return;
    Alert.alert("Herkesten silinsin mi?", "Mesaj iki taraftan da kaldırılır.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Herkesten sil",
        style: "destructive",
        onPress: () =>
          api(`/api/me/conversations/${id}/messages/${m.id}`, { method: "DELETE" }).then(
            () => setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, asset: null, stickerUrl: null } : x))),
            (e) => setError(e instanceof ApiError ? e.message : "Silinemedi"),
          ),
      },
    ]);
  }

  async function setState(state: "ACTIVE" | "ARCHIVED") {
    try {
      await api(`/api/me/conversations/${id}`, { method: "PATCH", body: { state } });
      if (conversation) setConversation({ ...conversation, state });
      if (state === "ARCHIVED") router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Olmadı");
    }
  }

  function block() {
    Alert.alert(`${conversation?.other.name ?? "Bu kişi"} engellensin mi?`, "Sana mesaj gönderemez ve gönderilerine yanıt veremez. Sohbet arşive taşınır.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Engelle",
        style: "destructive",
        onPress: () => api(`/api/me/conversations/${id}/block`, { method: "POST" }).then(() => router.back(), (e) => setError(e instanceof ApiError ? e.message : "Engellenemedi")),
      },
    ]);
  }

  function menu() {
    const archive = conversation?.state === "ARCHIVED" ? "Arşivden çıkar" : "Arşivle";
    const username = conversation?.other.username;
    const reportProfile = () =>
      username && setReport({ target: "PROFILE", targetId: username, title: `${conversation?.other.name ?? "Kişiyi"} şikayet et` });
    const run = (i: number) =>
      i === 0 ? setState(conversation?.state === "ARCHIVED" ? "ACTIVE" : "ARCHIVED") : i === 1 ? block() : i === 2 ? reportProfile() : undefined;
    if (Platform.OS === "ios") {
      const options = username ? [archive, "Engelle", "Şikayet et", "Vazgeç"] : [archive, "Engelle", "Vazgeç"];
      ActionSheetIOS.showActionSheetWithOptions({ options, destructiveButtonIndex: 1, cancelButtonIndex: options.length - 1 }, (i) =>
        i < options.length - 1 ? run(i) : undefined,
      );
    } else {
      Alert.alert(conversation?.other.name ?? "Sohbet", undefined, [
        { text: archive, onPress: () => run(0) },
        { text: "Engelle", style: "destructive", onPress: () => run(1) },
        ...(username ? [{ text: "Şikayet et", onPress: () => run(2) }] : []),
        { text: "Vazgeç", style: "cancel" as const },
      ]);
    }
  }

  const typing = typingAt > 0;
  const status = !conversation
    ? ""
    : typing
      ? "yazıyor…"
      : conversation.presence?.online
        ? "çevrimiçi"
        : conversation.presence?.lastSeenAt
          ? lastSeen(conversation.presence.lastSeenAt)
          : "";

  const header = useMemo(
    () => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {conversation ? <Avatar name={conversation.other.name} url={conversation.other.avatarUrl} size={36} /> : null}
        <View>
          <Text style={{ color: c.ink, fontWeight: "600", fontSize: 16 }} numberOfLines={1}>
            {conversation?.other.name ?? ""}
          </Text>
          {status ? <Text style={{ color: typing ? c.accent : c.ink3, fontSize: 12 }}>{status}</Text> : null}
        </View>
      </View>
    ),
    [conversation, status, typing, c],
  );

  if (failed) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: c.ink2 }}>{failed}</Text>
      </View>
    );
  }

  const bubbleMax = width * 0.78;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          headerTitle: () => header,
          headerRight: () => (
            <Pressable accessibilityLabel="Sohbet menüsü" onPress={menu} hitSlop={10}>
              <IconDotsVertical size={22} color={c.ink2} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => String(m.id)}
        onEndReached={older}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 12, gap: 4 }}
        ListHeaderComponent={
          typing ? (
            <View style={{ alignSelf: "flex-start", backgroundColor: c.surface2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 }}>
              <Text style={{ color: c.ink3 }}>•••</Text>
            </View>
          ) : undefined
        }
        renderItem={({ item: m, index }) => {
          const older = messages[index + 1];
          const showDay = !older || !sameDay(older.createdAt, m.createdAt);
          const sticker = m.kind === "STICKER" && !m.deleted;
          const ticks = m.mine && !m.deleted && conversation ? (
            m.failed ? (
              <Text style={{ color: c.danger, fontSize: 11 }}>!</Text>
            ) : m.pending ? (
              <IconClock size={13} color={sticker ? c.ink3 : c.onAccent} />
            ) : conversation.otherReadSeq != null && m.seq <= conversation.otherReadSeq ? (
              <IconChecks size={15} color="#0ea5e9" />
            ) : m.seq <= conversation.otherDeliveredSeq ? (
              <IconChecks size={15} color={sticker ? c.ink3 : c.onAccent} />
            ) : (
              <IconCheck size={14} color={sticker ? c.ink3 : c.onAccent} />
            )
          ) : null;
          const meta = (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-end", marginTop: 2 }}>
              <Text style={{ fontSize: 11, color: m.mine && !sticker ? c.onAccent : c.ink3, opacity: 0.8 }}>{clockTime(m.createdAt)}</Text>
              {ticks}
            </View>
          );
          return (
            <View>
              {showDay ? (
                <Text style={{ alignSelf: "center", marginVertical: 8, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, overflow: "hidden", backgroundColor: c.surface, color: c.ink3, fontSize: 12 }}>
                  {dayLabel(m.createdAt)}
                </Text>
              ) : null}
              <Pressable onLongPress={() => messageMenu(m)} onPress={m.failed ? () => messageMenu(m) : undefined} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: bubbleMax }}>
                {sticker ? (
                  <View style={{ alignItems: m.mine ? "flex-end" : "flex-start" }}>
                    {m.stickerUrl?.startsWith("/api/public/assets/") ? (
                      <AuthImage path={m.stickerUrl} style={{ width: 130, height: 130 }} contentFit="contain" />
                    ) : (
                      <Image source={{ uri: absolute(m.stickerUrl ?? "") }} style={{ width: 130, height: 130 }} contentFit="contain" />
                    )}
                    {meta}
                  </View>
                ) : (
                  <View style={{ backgroundColor: m.mine ? c.accent : c.surface2, borderRadius: 16, borderBottomRightRadius: m.mine ? 4 : 16, borderBottomLeftRadius: m.mine ? 16 : 4, paddingHorizontal: 10, paddingVertical: 6, opacity: m.failed ? 0.7 : 1 }}>
                    {m.deleted ? (
                      <Text style={{ fontStyle: "italic", color: m.mine ? c.onAccent : c.ink2 }}>{m.mine ? "Bu mesajı sildin" : "Bu mesaj silindi"}</Text>
                    ) : (
                      <>
                        {m.asset ? (
                          m.asset.kind === "VIDEO" ? (
                            <VideoPlayer asset={m.asset} style={{ width: Math.min(bubbleMax - 20, 260), height: 200, borderRadius: 12, overflow: "hidden", marginBottom: 4 }} />
                          ) : (
                            <Pressable onPress={() => setViewer(m.asset)}>
                              <AuthImage
                                path={m.asset.largeUrl}
                                style={{
                                  width: Math.min(bubbleMax - 20, 260),
                                  aspectRatio: m.asset.width && m.asset.height ? Math.min(Math.max(m.asset.width / m.asset.height, 0.75), 1.9) : 4 / 3,
                                  borderRadius: 12,
                                  marginBottom: 4,
                                }}
                              />
                            </Pressable>
                          )
                        ) : null}
                        {m.body ? <LinkedText text={m.body} color={m.mine ? c.onAccent : c.ink} linkColor={m.mine ? c.onAccent : c.accent} /> : null}
                      </>
                    )}
                    {meta}
                  </View>
                )}
              </Pressable>
              {m.failed ? <Text style={{ alignSelf: "flex-end", color: c.danger, fontSize: 12 }}>Gönderilemedi · tekrar denemek için dokun</Text> : null}
            </View>
          );
        }}
      />
      {conversation?.state === "REQUEST" ? (
        <View style={{ padding: 12, gap: 8, backgroundColor: c.surface2, borderTopWidth: 1, borderTopColor: c.line }}>
          <Text style={{ color: c.ink2 }}>
            <Text style={{ fontWeight: "600", color: c.ink }}>{conversation.other.name}</Text> sana mesaj göndermek istiyor. Yanıt verirsen ya da kabul edersen sohbet açılır.
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setState("ACTIVE")} style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.onAccent, fontWeight: "600" }}>Kabul et</Text>
            </Pressable>
            <Pressable onPress={block} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: c.danger, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.danger }}>Engelle</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {error ? (
        <Pressable onPress={() => setError(null)}>
          <Text style={{ color: c.danger, paddingHorizontal: 14, paddingVertical: 6 }}>{error}</Text>
        </Pressable>
      ) : null}
      {pending ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line }}>
          <Image source={{ uri: pending.uri }} style={{ width: 56, height: 56, borderRadius: 10 }} contentFit="cover" />
          <View style={{ flex: 1 }}>
            {pending.asset ? (
              <Text style={{ color: c.ink3, fontSize: 13 }}>Hazır · orijinal kalitede gidecek. İstersen açıklama yaz.</Text>
            ) : (
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: "hidden" }}>
                <View style={{ height: 6, width: `${Math.round(pending.progress * 100)}%`, backgroundColor: c.accent }} />
              </View>
            )}
          </View>
          <Pressable accessibilityLabel="Vazgeç" onPress={() => setPending(null)} hitSlop={8}>
            <IconX size={20} color={c.ink2} />
          </Pressable>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: 8, paddingTop: 8, paddingBottom: insets.bottom + 8, backgroundColor: c.surface, borderTopWidth: pending ? 0 : 1, borderTopColor: c.line }}>
        <Pressable accessibilityLabel="Sticker" onPress={() => setStickers(true)} style={{ width: 40, height: 42, alignItems: "center", justifyContent: "center" }}>
          <IconMoodSmile size={24} color={c.ink2} />
        </Pressable>
        <Pressable accessibilityLabel="Fotoğraf ya da video gönder" onPress={attach} style={{ width: 36, height: 42, alignItems: "center", justifyContent: "center" }}>
          <IconPaperclip size={22} color={c.ink2} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={onType}
          placeholder={pending ? "Açıklama ekle" : "Mesaj yaz"}
          placeholderTextColor={c.ink3}
          multiline
          maxLength={4000}
          style={{ flex: 1, minHeight: 42, maxHeight: 130, borderRadius: 20, backgroundColor: c.bg, paddingHorizontal: 14, paddingVertical: 10, color: c.ink, fontSize: 16 }}
        />
        <Pressable
          accessibilityLabel="Gönder"
          onPress={submit}
          disabled={pending ? !pending.asset : !text.trim()}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", opacity: (pending ? !pending.asset : !text.trim()) ? 0.4 : 1 }}
        >
          <IconSend size={19} color={c.onAccent} />
        </Pressable>
      </View>
      <StickerSheet
        visible={stickers}
        onClose={() => setStickers(false)}
        onPick={(choice: StickerChoice) => {
          setStickers(false);
          deliver({ kind: "STICKER", ...choice });
        }}
      />
      <Viewer media={viewer ? [viewer] : []} index={viewer ? 0 : null} onClose={() => setViewer(null)} />
      <ReportSheet request={report} onClose={() => setReport(null)} />
    </KeyboardAvoidingView>
  );
}
