import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

export type PushSetup =
  | { status: "registered"; token: string }
  | { status: "denied" }
  | { status: "unsupported"; reason: string };

/** Uygulama acikken gelen bildirim de banner olarak gosterilir. */
export function configureNotificationHandling() {
  if (Platform.OS === "web") return () => {};
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  // Bildirime dokununca ilgili ekrana gidilir (sunucu data.path gonderir: "/" ya da "/stats").
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const path = response.notification.request.content.data?.path;
    if (typeof path === "string" && path.startsWith("/")) router.push(path as never);
  });
  return () => subscription.remove();
}

/**
 * Izin ister ve cihazin Expo push adresini alir. Uygulamanin bir Expo projesine bagli olmasi gerekir
 * (app.json extra.eas.projectId); yoksa nedenini doner, uygulama calismaya devam eder.
 */
export async function setUpPush(): Promise<PushSetup> {
  if (Platform.OS === "web") return { status: "unsupported", reason: "Tarayıcıda bildirim yok; uygulamada açılır." };
  if (!Device.isDevice && Platform.OS === "ios") {
    return { status: "unsupported", reason: "iOS Simulator push bildirim alamaz; gerçek iPhone gerekir." };
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Genel",
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { status: "denied" };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return { status: "unsupported", reason: "Uygulama henüz bir Expo projesine bağlı değil (projectId yok)." };
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return { status: "registered", token: data };
}
