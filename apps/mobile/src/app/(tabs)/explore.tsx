import { IconPencil } from "@tabler/icons-react-native";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PostItem } from "@/components/PostItem";
import { useApi } from "@/lib/api";
import { useColors } from "@/lib/theme";
import type { Post, PostPage } from "@/lib/types";
import { useMeAndCards } from "@/lib/useMe";

/** Kesfet: dogrulanmis hesaplarin herkese acik son paylasimlari; asagi kaydirdikca devami yuklenir. */
export default function Explore() {
  const c = useColors();
  const api = useApi();
  const { me } = useMeAndCards();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    try {
      const page = await api<PostPage>("/api/public/posts");
      setPosts(page.posts);
      setNext(page.next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [api]);

  // Gonderi yazip donunce liste tazelenir.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function more() {
    if (!next || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await api<PostPage>(`/api/public/posts?cursor=${encodeURIComponent(next)}`);
      setPosts((list) => [...(list ?? []), ...page.posts.filter((p) => !list?.some((o) => o.id === p.id))]);
      setNext(page.next);
    } finally {
      loadingMore.current = false;
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
        <Text style={{ fontSize: 26, fontWeight: "700", color: c.ink, letterSpacing: -0.4 }}>Keşfet</Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: c.ink3 }}>Doğrulanmış hesapların son paylaşımları</Text>
      </View>
      {posts === null ? (
        failed ? (
          <Pressable onPress={load} style={{ padding: 24 }}>
            <Text style={{ color: c.danger, textAlign: "center" }}>Yüklenemedi. Tekrar denemek için dokun.</Text>
          </Pressable>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />
        )
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostItem
              post={item}
              onChange={(p) => setPosts((list) => list && list.map((o) => (o.id === p.id ? p : o)))}
              onDelete={(id) => setPosts((list) => list && list.filter((o) => o.id !== id))}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.line }} />}
          onEndReached={more}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={c.accent}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={<Text style={{ color: c.ink3, textAlign: "center", padding: 32 }}>Henüz paylaşım yok. İlk paylaşan sen ol.</Text>}
          contentContainerStyle={{ paddingBottom: 96 }}
        />
      )}
      {me?.profile ? (
        <Pressable
          accessibilityLabel="Gönderi yaz"
          onPress={() => router.push("/compose")}
          style={{ position: "absolute", right: 18, bottom: 22, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", elevation: 4 }}
        >
          <IconPencil size={24} color={c.onAccent} />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}
