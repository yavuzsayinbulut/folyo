import { IconQuote } from "@tabler/icons-react-native";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { Body, Button, PlatformBadge, Screen } from "@/components/ui";
import { TYPE_PLATFORM, platformForUrl } from "@/lib/platforms";
import { useSession } from "@/lib/session";
import { useColors } from "@/lib/theme";

export default function Login() {
  const c = useColors();
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const result = await signIn();
      if (result === "failed") setError("Giriş tamamlanamadı, tekrar dene.");
    } catch {
      setError("Sunucuya ulaşılamadı. Bağlantını kontrol et.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
        <Image source={require("@/assets/images/icon.png")} style={{ width: 34, height: 34, borderRadius: 9 }} />
        <Text style={{ fontSize: 20, fontWeight: "700", color: c.ink, letterSpacing: -0.3 }}>folyo</Text>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        <BentoIllustration />
        <Text style={{ marginTop: 28, fontSize: 36, fontWeight: "800", color: c.ink, letterSpacing: -0.8, lineHeight: 40 }}>
          Sayfan,{"\n"}cebinde.
        </Text>
        <Body muted style={{ marginTop: 10, fontSize: 16, lineHeight: 23 }}>
          Kartlarını düzenle, kimin baktığını gör, profilini QR ile paylaş.
        </Body>
      </View>

      <View style={{ gap: 10 }}>
        <Button label="Giriş yap" onPress={start} busy={busy} />
        <Body muted style={{ fontSize: 13, textAlign: "center" }}>
          Giriş web hesabınla tarayıcıda yapılır; şifren uygulamaya girmez.
        </Body>
        {error ? <Body danger style={{ textAlign: "center" }}>{error}</Body> : null}
      </View>
    </Screen>
  );
}

/** Uygulamanin ne yaptigini anlatan kucuk bento: gercek kart bilesenlerinin sade hali. */
function BentoIllustration() {
  const c = useColors();
  const tile = { borderRadius: 18, backgroundColor: c.surface, padding: 12 } as const;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={[tile, { flex: 2, height: 96, justifyContent: "space-between" }]}>
          <PlatformBadge platform={TYPE_PLATFORM.SPOTIFY} size={30} />
          <View>
            <Text style={{ fontSize: 11, color: c.ink3 }}>Şu an dinliyor</Text>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: c.ink }}>Gece yarısı şehir</Text>
          </View>
        </View>
        <View style={[tile, { flex: 1, height: 96, justifyContent: "space-between" }]}>
          <PlatformBadge platform={TYPE_PLATFORM.GITHUB} size={30} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: c.ink }}>GitHub</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={[tile, { flex: 1, height: 86, justifyContent: "space-between" }]}>
          <PlatformBadge platform={platformForUrl("https://instagram.com")} size={30} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: c.ink }}>Instagram</Text>
        </View>
        <View style={[tile, { flex: 2, height: 86, gap: 4 }]}>
          <IconQuote size={14} color={c.ink3} />
          <Text numberOfLines={2} style={{ fontSize: 13, color: c.ink, lineHeight: 18 }}>
            Backend geliştiriciyim. Hafta sonları film fotoğrafı.
          </Text>
        </View>
      </View>
    </View>
  );
}
