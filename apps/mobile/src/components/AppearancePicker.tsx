import { IconCheck } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, useColorScheme, View } from "react-native";
import { ApiError, useApi } from "@/lib/api";
import { ACCENTS, pageLook, THEMES, type AccentKey, type ThemeKey } from "@/lib/pageThemes";
import { useColors } from "@/lib/theme";
import type { Profile } from "@/lib/types";

/** Sayfa sablonu ve vurgu rengi; secim aninda kaydedilir, Sayfa sekmesindeki onizleme de ayni renklerle cizilir. */
export function AppearancePicker({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const c = useColors();
  const api = useApi();
  const deviceDark = useColorScheme() === "dark";
  const [error, setError] = useState<string | null>(null);

  async function choose(theme: ThemeKey, accent: AccentKey | null) {
    if (theme === profile.theme && accent === profile.accent) return;
    const previous = profile;
    onSaved({ ...profile, theme, accent });
    setError(null);
    try {
      onSaved(await api<Profile>("/api/me/profile/appearance", { method: "PUT", body: { theme, accent } }));
    } catch (e) {
      onSaved(previous);
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi, tekrar dene.");
    }
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
        {THEMES.map((theme) => {
          const look = pageLook(theme.key, null, deviceDark);
          const selected = profile.theme === theme.key;
          return (
            <Pressable
              key={theme.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${theme.name} şablonu: ${theme.description}`}
              onPress={() => choose(theme.key, profile.accent)}
              style={({ pressed }) => ({
                width: 112,
                borderRadius: 16,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? c.accent : c.line,
                backgroundColor: c.surface,
                padding: 8,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View style={{ height: 64, borderRadius: 10, backgroundColor: look.bg, padding: 7, gap: 5 }}>
                <View style={{ flexDirection: "row", gap: 5 }}>
                  <View style={{ flex: 2, height: 20, borderRadius: Math.min(look.radius, 8), backgroundColor: look.surface, borderWidth: 1, borderColor: look.line }} />
                  <View style={{ flex: 1, height: 20, borderRadius: Math.min(look.radius, 8), backgroundColor: look.accent }} />
                </View>
                <View style={{ flexDirection: "row", gap: 5 }}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={{ flex: 1, height: 20, borderRadius: Math.min(look.radius, 8), backgroundColor: look.surface, borderWidth: 1, borderColor: look.line }} />
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.ink }}>{theme.name}</Text>
                {selected ? <IconCheck size={15} color={c.accent} /> : null}
              </View>
              <Text numberOfLines={2} style={{ fontSize: 11, color: c.ink3, marginTop: 1 }}>{theme.description}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={{ fontSize: 13, color: c.ink2, marginTop: 14, marginBottom: 8 }}>Vurgu rengi</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: profile.accent === null }}
          onPress={() => choose(profile.theme, null)}
          style={{
            height: 34,
            paddingHorizontal: 12,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: profile.accent === null ? c.accent : c.lineStrong,
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 13, color: profile.accent === null ? c.ink : c.ink2 }}>Şablonun rengi</Text>
        </Pressable>
        {ACCENTS.map((accent) => {
          const selected = profile.accent === accent.key;
          return (
            <Pressable
              key={accent.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={accent.name}
              hitSlop={6}
              onPress={() => choose(profile.theme, accent.key)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: accent.light,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: selected ? 3 : 0,
                borderColor: c.ink,
              }}
            >
              {selected ? <IconCheck size={15} color="#ffffff" /> : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={{ marginTop: 8, color: c.danger }}>{error}</Text> : null}
    </View>
  );
}
