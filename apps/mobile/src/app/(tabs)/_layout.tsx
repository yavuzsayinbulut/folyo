import { IconChartBar, IconLayoutGrid, IconShare, IconUser } from "@tabler/icons-react-native";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { configureNotificationHandling } from "@/lib/notifications";
import { useColors } from "@/lib/theme";
import { useWidgetSync } from "@/lib/useWidgetSync";

export default function TabLayout() {
  const c = useColors();
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
      <Tabs.Screen name="stats" options={{ title: "İstatistik", tabBarIcon: ({ color, size }) => <IconChartBar color={color} size={size} /> }} />
      <Tabs.Screen name="share" options={{ title: "Paylaş", tabBarIcon: ({ color, size }) => <IconShare color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: ({ color, size }) => <IconUser color={color} size={size} /> }} />
    </Tabs>
  );
}
