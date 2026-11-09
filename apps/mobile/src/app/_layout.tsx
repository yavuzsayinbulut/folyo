import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { SessionProvider, useSession } from "@/lib/session";

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready, token } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Oturum yoksa yalniz giris ekranlari erisilebilir. */}
      <Stack.Protected guard={!!token}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-card" options={{ presentation: "modal", headerShown: true, title: "Kart ekle" }} />
      </Stack.Protected>
      <Stack.Protected guard={!token}>
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
