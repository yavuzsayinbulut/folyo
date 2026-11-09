import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import VisitsWidget from "@/widgets/VisitsWidget";
import { EMPTY_VISITS } from "@/widgets/types";
import { API_URL, WEB_URL } from "./config";

const TOKEN_KEY = "folyo.token";
/** Expo web: acilir pencere engellenirse giris ayni sekmede doner; verifier bu sekmenin oturumunda bekler. */
const WEB_VERIFIER_KEY = "folyo.pkce.verifier";

/** Token iOS Keychain / Android Keystore'da tutulur. Expo web (yalniz gelistirme) icin localStorage. */
const storage = {
  get: () => (Platform.OS === "web" ? Promise.resolve(localStorage.getItem(TOKEN_KEY)) : SecureStore.getItemAsync(TOKEN_KEY)),
  set: (value: string) =>
    Platform.OS === "web" ? Promise.resolve(localStorage.setItem(TOKEN_KEY, value)) : SecureStore.setItemAsync(TOKEN_KEY, value),
  clear: () => (Platform.OS === "web" ? Promise.resolve(localStorage.removeItem(TOKEN_KEY)) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

function base64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Session = {
  ready: boolean;
  token: string | null;
  signIn: () => Promise<"ok" | "cancelled" | "failed">;
  /** Yalniz Expo web: ayni sekmeye donen kodu, bu sekmede saklanan verifier ile token'a cevirir. */
  completeWebRedirect: (code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Anahtar deposu okunamazsa (or. yedekten geri yuklenen Android) acilis takilmaz: kayit silinir, giris istenir.
    storage
      .get()
      .then(setToken, () => storage.clear().catch(() => undefined))
      .finally(() => setReady(true));
  }, []);

  /**
   * PKCE ile giris: verifier uygulamada kalir, yalniz ozeti (challenge) web'e gider. Web'de onaylanan tek kullanimlik
   * kod, verifier ile birlikte token'a cevrilir; kod yolda yakalansa bile tek basina ise yaramaz.
   */
  const exchange = useCallback(async (code: string, verifier: string) => {
    const response = await fetch(`${API_URL}/api/mobile/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier, deviceName: Device.modelName ?? Platform.OS }),
    });
    if (!response.ok) return false;
    const { token: issued } = (await response.json()) as { token: string };
    await storage.set(issued);
    setToken(issued);
    return true;
  }, []);

  const signIn = useCallback(async () => {
    const verifier = base64Url(btoa(String.fromCharCode(...Crypto.getRandomBytes(48))));
    if (Platform.OS === "web") sessionStorage.setItem(WEB_VERIFIER_KEY, verifier);
    const challenge = base64Url(
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }),
    );
    const redirect = Linking.createURL("auth");
    const url = `${WEB_URL}/mobile-login?challenge=${challenge}&redirect=${encodeURIComponent(redirect)}`;

    const result = await WebBrowser.openAuthSessionAsync(url, redirect);
    if (result.type !== "success") return "cancelled";
    const code = Linking.parse(result.url).queryParams?.code;
    if (typeof code !== "string") return "failed";
    if (Platform.OS === "web") sessionStorage.removeItem(WEB_VERIFIER_KEY);
    return (await exchange(code, verifier)) ? "ok" : "failed";
  }, [exchange]);

  const completeWebRedirect = useCallback(
    async (code: string) => {
      const verifier = Platform.OS === "web" ? sessionStorage.getItem(WEB_VERIFIER_KEY) : null;
      if (!verifier) return false;
      sessionStorage.removeItem(WEB_VERIFIER_KEY);
      return exchange(code, verifier);
    },
    [exchange],
  );

  /**
   * Sunucuda yalniz bu cihazin token'i iptal edilir; ag hatasinda da yerel oturum kapanir.
   * Ana ekran widget'i da bosaltilir: cikistan sonra onceki hesabin ziyaretci sayisi ve mesajlari gorunmez.
   */
  const signOut = useCallback(async () => {
    if (token) {
      await fetch(`${API_URL}/api/me/mobile/token`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(
        () => undefined,
      );
    }
    try {
      VisitsWidget.updateSnapshot(EMPTY_VISITS);
    } catch {
      // Widget desteklenmeyen platformda (web) sessizce gecilir.
    }
    await storage.clear().catch(() => undefined);
    setToken(null);
  }, [token]);

  const value = useMemo(
    () => ({ ready, token, signIn, completeWebRedirect, signOut }),
    [ready, token, signIn, completeWebRedirect, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider eksik");
  return session;
}
