/**
 * Desktop navigation rail — persistent across the whole app on wide screens.
 * Lives at the root layout so it stays put through deep flows (CIA, KCC, Pashu,
 * Society, dairy), not just the five tabs. Phone keeps the bottom tab bar.
 */
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useI18n, LangToggle } from "../lib/i18n";

export { DESKTOP_MIN, useIsDesktop } from "../lib/responsive";

// Routes with no app chrome — the shell (sidebar + content frame) is hidden here.
const PRE_AUTH = ["/login", "/register", "/forgot-password", "/aadhaar-verify"];
export const isPreAuthRoute = (pathname: string) =>
  PRE_AUTH.some((p) => pathname === p || pathname.startsWith(p));

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const NAV: { key: string; href: string; labelKey: string; icon: IconName; match: (p: string) => boolean }[] = [
  { key: "home", href: "/(tabs)", labelKey: "tab.home", icon: "home", match: (p) => p === "/" || p === "" || p.startsWith("/(tabs)") || p.startsWith("/cia-") },
  { key: "society", href: "/society", labelKey: "tab.society", icon: "water", match: (p) => p.startsWith("/society") },
  { key: "kcc", href: "/kcc", labelKey: "tab.kcc", icon: "card", match: (p) => p === "/kcc" || p.startsWith("/kcc-") },
  { key: "suraksha", href: "/suraksha", labelKey: "tab.suraksha", icon: "shield-checkmark", match: (p) => p === "/suraksha" || p.startsWith("/pashu") },
  { key: "farm", href: "/farm", labelKey: "tab.farm", icon: "leaf", match: (p) => p === "/farm" || p.startsWith("/dairy") || p.startsWith("/activity") || p.startsWith("/setup") },
];

export function DesktopSidebar() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const activeKey = NAV.find((n) => n.match(pathname))?.key ?? "home";

  return (
    <View style={styles.side}>
      <TouchableOpacity style={styles.brand} activeOpacity={0.8} onPress={() => router.replace("/(tabs)" as any)}>
        <Text style={styles.brandMark}>🌾</Text>
        <View>
          <Text style={styles.brandName}>Allied KCC</Text>
          <Text style={styles.brandSub}>{lang === "hi" ? "किसान" : "Farmer"}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.nav}>
        {NAV.map((n) => {
          const active = n.key === activeKey;
          return (
            <TouchableOpacity
              key={n.key}
              style={[styles.navItem, active && styles.navItemActive]}
              activeOpacity={0.8}
              onPress={() => router.replace(n.href as any)}
            >
              <Ionicons name={n.icon} size={20} color={active ? "#0f7a4d" : "#6b7c74"} />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{t(n.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.sideFoot}><LangToggle /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  side: { width: 244, backgroundColor: "#fff", borderRightWidth: 1, borderRightColor: "#e2e8e4", paddingVertical: 18, paddingHorizontal: 14 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginBottom: 22 },
  brandMark: { fontSize: 26 },
  brandName: { fontSize: 16, fontWeight: "800", color: "#14201b", letterSpacing: -0.2 },
  brandSub: { fontSize: 11, fontWeight: "700", color: "#8a9a92", textTransform: "uppercase", letterSpacing: 0.5 },
  nav: { gap: 4 },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 11 },
  navItemActive: { backgroundColor: "#e7f2ec" },
  navLabel: { fontSize: 14.5, fontWeight: "600", color: "#4a5852" },
  navLabelActive: { color: "#0a5c3a", fontWeight: "800" },
  sideFoot: { marginTop: "auto", paddingHorizontal: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#eef3f0", flexDirection: "row" },
});
