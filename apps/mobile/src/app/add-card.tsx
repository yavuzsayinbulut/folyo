import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Body, Button, Field, PlatformBadge, Screen } from "@/components/ui";
import { ApiError, useApi } from "@/lib/api";
import { WEB_URL } from "@/lib/config";
import { platformForUrl, TYPE_PLATFORM } from "@/lib/platforms";
import { useColors } from "@/lib/theme";
import type { CardType } from "@/lib/types";

const CHOICES: { type: CardType; label: string }[] = [
  { type: "LINK", label: "Link" },
  { type: "TEXT", label: "Metin" },
  { type: "GITHUB", label: "GitHub" },
  { type: "LASTFM", label: "Last.fm" },
  { type: "REDDIT", label: "Reddit" },
  { type: "GALLERY", label: "Galeri" },
  { type: "SPOTIFY", label: "Spotify" },
  { type: "STRAVA", label: "Strava" },
];

const USERNAME_TYPES: CardType[] = ["GITHUB", "LASTFM", "REDDIT"];

export default function AddCard() {
  const c = useColors();
  const api = useApi();
  const [type, setType] = useState<CardType>("LINK");
  const [value, setValue] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsWeb = type === "SPOTIFY" || type === "STRAVA";

  async function add() {
    if ((type === "LINK" || type === "TEXT" || USERNAME_TYPES.includes(type)) && !value.trim()) {
      return setError(type === "LINK" ? "Bir link yaz" : type === "TEXT" ? "Kart metnini yaz" : "Kullanıcı adını yaz");
    }
    const config =
      type === "LINK" ? { url: value, title } : type === "TEXT" ? { text: value } : type === "GALLERY" ? { title: value } : { username: value };
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/cards", { method: "POST", body: { type, config } });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kart eklenemedi");
    } finally {
      setBusy(false);
    }
  }

  const detected = type === "LINK" && value.trim() ? platformForUrl(value.includes("://") ? value : `https://${value}`) : null;

  return (
    <Screen>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {CHOICES.map((choice) => {
          const active = choice.type === type;
          const platform = choice.type === "LINK" ? platformForUrl() : TYPE_PLATFORM[choice.type];
          return (
            <Pressable
              key={choice.type}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => {
                setType(choice.type);
                setValue("");
                setTitle("");
                setError(null);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingLeft: 4,
                paddingRight: 12,
                height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: active ? c.accent : c.lineStrong,
                backgroundColor: active ? c.accentSoft : "transparent",
              }}
            >
              <PlatformBadge platform={platform} size={28} />
              <Text style={{ fontSize: 14, color: active ? c.accentInk : c.ink2 }}>{choice.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {type === "LINK" && (
        <>
          <Field label="Link" value={value} onChangeText={setValue} placeholder="instagram.com/adin" keyboardType="url" />
          <Field label="Başlık (isteğe bağlı)" value={title} onChangeText={setTitle} placeholder={detected?.name ?? "GitHub"} maxLength={80} />
          {detected && detected.name !== "Web" ? <Body muted style={{ marginTop: -6, marginBottom: 12 }}>{detected.name} olarak tanındı</Body> : null}
        </>
      )}
      {type === "TEXT" && (
        <Field
          label="Metin"
          value={value}
          onChangeText={setValue}
          multiline
          maxLength={280}
          autoCapitalize="sentences"
          placeholder="Kendinden kısaca bahset"
          style={{ height: 100, paddingTop: 10, textAlignVertical: "top" }}
        />
      )}
      {USERNAME_TYPES.includes(type) && (
        <Field label={`${TYPE_PLATFORM[type as "GITHUB"].name} kullanıcı adın`} value={value} onChangeText={setValue} placeholder="adin" />
      )}
      {type === "GALLERY" && <Field label="Galeri başlığı (isteğe bağlı)" value={value} onChangeText={setValue} maxLength={60} autoCapitalize="sentences" />}

      {needsWeb ? (
        <>
          <Body muted style={{ marginBottom: 14 }}>
            {type === "SPOTIFY" ? "Spotify" : "Strava"} hesabını bağlamak şimdilik web editöründen yapılıyor. Bağladıktan sonra kartı buradan ekleyebilirsin.
          </Body>
          <Button label="Web editörünü aç" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/edit`)} />
          <View style={{ height: 10 }} />
          <Button label="Kartı ekle" onPress={add} busy={busy} />
        </>
      ) : (
        <Button label="Kartı ekle" onPress={add} busy={busy} />
      )}
      {error ? <Body danger style={{ marginTop: 10, textAlign: "center" }}>{error}</Body> : null}
    </Screen>
  );
}
