import * as WebBrowser from "expo-web-browser";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { useSession } from "@/lib/session";

// Expo web, acilir pencere: kod acan pencereye iletilir ve bu pencere kapanir.
const popup = Platform.OS === "web" ? WebBrowser.maybeCompleteAuthSession() : null;

/**
 * Giris donusu. Native'de donusu openAuthSessionAsync yakalar; bu ekran yalniz yonlendirir.
 * Expo web'de acilir pencere engellenmisse giris ayni sekmeye doner; kod burada token'a cevrilir.
 */
export default function AuthCallback() {
  const { token, completeWebRedirect } = useSession();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const sameTab = Platform.OS === "web" && popup?.type !== "success" && typeof code === "string";
  const [done, setDone] = useState(!sameTab);

  useEffect(() => {
    if (sameTab && code) completeWebRedirect(code).finally(() => setDone(true));
  }, [sameTab, code, completeWebRedirect]);

  if (!done) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  // Oturum yokken "/" korumali; dogrudan girise gidilir, yoksa "/" -> auth -> "/" dongusu olusur.
  return <Redirect href={token ? "/" : "/login"} />;
}
