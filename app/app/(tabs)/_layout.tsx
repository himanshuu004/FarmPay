/**
 * Persona shell. Phone → bottom tab bar. Desktop → just the active tab's content
 * (<Slot/>); the persistent navigation rail lives at the root layout so it stays
 * put across deep flows too. One breakpoint (900px), same screens either way.
 */
import { Tabs, Slot } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n, LangToggle } from "../../lib/i18n";
import { useIsDesktop } from "../../components/DesktopSidebar";

export default function TabLayout() {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();

  if (isDesktop) return <Slot />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0f7a4d",
        tabBarInactiveTintColor: "#8a9a92",
        tabBarStyle: { borderTopColor: "#e2e8e4" },
        headerStyle: { backgroundColor: "#0f7a4d" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" },
        headerRight: () => <LangToggle light />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tab.home"), tabBarLabel: t("tab.home"), tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="society" options={{ title: t("nav.society_passbook"), tabBarLabel: t("tab.society"), tabBarIcon: ({ color, size }) => <Ionicons name="water" color={color} size={size} /> }} />
      <Tabs.Screen name="kcc" options={{ title: t("home.your_kcc"), tabBarLabel: t("tab.kcc"), tabBarIcon: ({ color, size }) => <Ionicons name="card" color={color} size={size} /> }} />
      <Tabs.Screen name="suraksha" options={{ title: t("nav.pashu_home"), tabBarLabel: t("tab.suraksha"), tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" color={color} size={size} /> }} />
      <Tabs.Screen name="farm" options={{ title: t("tab.farm"), tabBarLabel: t("tab.farm"), tabBarIcon: ({ color, size }) => <Ionicons name="leaf" color={color} size={size} /> }} />
    </Tabs>
  );
}
