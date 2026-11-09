import { IconCompass, IconLayoutGrid, IconMessageCircle, IconShare, IconUser } from "@tabler/icons-react-native";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { configureNotificationHandling } from "@/lib/notifications";
import { useColors } from "@/lib/theme";
import { useUnread } from "@/lib/useUnread";
import { useWidgetSync } from "@/lib/useWidgetSync";

export default function TabNavigator() {
  const c = useColors();
  const { unread } = useUnread();
  const badge = unread.chats + unread.requests;
  useWidgetSync();
  useEffect(() => configureNotificationHandling(), []);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.ink3,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Sayfa", tabBarIcon: ({ color, size }) => <IconLayoutGrid color={color} size={size} /> }} />
      <Tabs.Screen name="explore" options={{ title: "Keşfet", tabBarIcon: ({ color, size }) => <IconCompass color={color} size={size} /> }} />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Sohbetler",
          tabBarBadge: badge > 0 ? badge : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, color: c.onAccent },
          tabBarIcon: ({ color, size }) => <IconMessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="share" options={{ title: "Paylaş", tabBarIcon: ({ color, size }) => <IconShare color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: ({ color, size }) => <IconUser color={color} size={size} /> }} />
      {/* Istatistik Sayfa ekranindan acilir; sekme cubugunda yer tutmaz. */}
      <Tabs.Screen name="stats" options={{ href: null, title: "İstatistik" }} />
    </Tabs>
  );
}
