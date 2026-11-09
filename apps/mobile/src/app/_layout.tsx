import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { RealtimeProvider } from "@/lib/realtime";
import { SessionProvider, useSession } from "@/lib/session";
import { UnreadProvider } from "@/lib/useUnread";

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready, token } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <RealtimeProvider>
      <UnreadProvider>
        <Screens signedIn={!!token} />
      </UnreadProvider>
    </RealtimeProvider>
  );
}

function Screens({ signedIn }: { signedIn: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Oturum yoksa yalniz giris ekranlari erisilebilir. */}
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-card" options={{ presentation: "modal", headerShown: true, title: "Kart ekle" }} />
        <Stack.Screen name="verify" options={{ presentation: "modal", headerShown: true, title: "Hesabını doğrula" }} />
        <Stack.Screen name="privacy" options={{ presentation: "modal", headerShown: true, title: "Gizlilik" }} />
        <Stack.Screen name="compose" options={{ presentation: "modal", headerShown: true, title: "Gönderi" }} />
        <Stack.Screen name="chat-settings" options={{ presentation: "modal", headerShown: true, title: "Sohbet ayarları" }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: "" }} />
        <Stack.Screen name="posts/[id]" options={{ headerShown: true, title: "Gönderi" }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Screen name="auth" />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      {/* Durum cubugu simgeleri temaya gore: acik temada koyu, koyu temada acik. */}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <SessionProvider>
        <Navigator />
      </SessionProvider>
    </ThemeProvider>
  );
}
