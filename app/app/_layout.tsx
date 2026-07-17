/**
 * Root stack layout — Allied KCC farmer app (dairy/livestock RECORD slice).
 *
 * Wrapped in <LanguageProvider> for two-language support (Hindi-first). Screen
 * titles are translated via t("nav.*"); every header carries a हिं|EN toggle so
 * the farmer can switch language anywhere.
 */

import React from "react";
import { Stack, useRouter, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LanguageProvider, useI18n, LangToggle } from "../lib/i18n";
import { DesktopSidebar, useIsDesktop, isPreAuthRoute } from "../components/DesktopSidebar";

// Header-right: language toggle + a "home" button → the persona hub.
const HeaderRight = ({ showHome = true }: { showHome?: boolean }) => {
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginRight: 8 }}>
      <LangToggle light />
      {showHome ? (
        <TouchableOpacity onPress={() => router.replace("/(tabs)" as any)} accessibilityLabel="Home" hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} style={{ padding: 2 }}>
          <Ionicons name="home" size={22} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

function Nav() {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const title = (key: string) => ({ title: t(key) });
  const titleNoHome = (key: string) => ({ title: t(key), headerRight: () => <HeaderRight showHome={false} /> });
  const stack = (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0f7a4d" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" as const, fontSize: 17 },
        headerBackTitle: t("common.back"),
        headerRight: () => <HeaderRight />,
        // Desktop: cap + centre each screen's body while the header stays full-bleed.
        contentStyle: isDesktop ? rootStyles.sceneContent : undefined,
      }}
    >
      {/* Pre-auth flows — no header */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="aadhaar-verify" options={{ headerShown: false }} />

      {/* The persona tab shell — its own nested headers */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Pashu Suraksha */}
      <Stack.Screen name="pashu-home" options={titleNoHome("nav.pashu_home")} />
      <Stack.Screen name="pashu-animals" options={title("nav.pashu_animals")} />
      <Stack.Screen name="pashu-vault" options={title("nav.pashu_vault")} />
      <Stack.Screen name="pashu-quote" options={title("nav.pashu_quote")} />
      <Stack.Screen name="pashu-enrol" options={title("nav.pashu_enrol")} />
      <Stack.Screen name="pashu-claim" options={title("nav.pashu_claim")} />
      <Stack.Screen name="pashu-renew" options={title("nav.pashu_renew")} />

      {/* KCC credit */}
      <Stack.Screen name="kcc-calculator" options={title("nav.kcc_calculator")} />
      <Stack.Screen name="kcc-apply" options={title("nav.kcc_apply")} />
      <Stack.Screen name="kcc-eligibility" options={title("nav.kcc_eligibility")} />
      <Stack.Screen name="kcc-limit" options={titleNoHome("nav.kcc_limit")} />
      <Stack.Screen name="kcc-drawdown" options={title("nav.kcc_drawdown")} />
      <Stack.Screen name="kcc-pack" options={title("nav.kcc_pack")} />

      {/* ── Cattle Induction (CIA) — application entry flow ── */}
      <Stack.Screen name="cia-schemes" options={title("nav.cia_schemes")} />
      <Stack.Screen name="cia-scheme" options={title("nav.cia_scheme")} />
      <Stack.Screen name="cia-eligibility" options={title("nav.cia_eligibility")} />
      <Stack.Screen name="cia-eoi" options={title("nav.cia_eoi")} />
      <Stack.Screen name="cia-application" options={title("nav.cia_application")} />
      <Stack.Screen name="cia-status" options={titleNoHome("nav.cia_status")} />
      <Stack.Screen name="cia-purchase" options={title("nav.cia_purchase")} />
      <Stack.Screen name="cia-emi" options={titleNoHome("nav.cia_emi")} />
      <Stack.Screen name="cia-emi-consent" options={title("nav.cia_emi_consent")} />
      <Stack.Screen name="cia-loan" options={titleNoHome("nav.cia_loan")} />
      <Stack.Screen name="cia-claim" options={title("nav.cia_claim")} />

      {/* Society wedge */}
      <Stack.Screen name="society-passbook" options={titleNoHome("nav.society_passbook")} />
      <Stack.Screen name="society-order" options={title("nav.society_order")} />
      <Stack.Screen name="society-orders" options={title("nav.society_orders")} />

      {/* Dairy hub + setup */}
      <Stack.Screen name="activity-dairy" options={titleNoHome("nav.activity_dairy")} />
      <Stack.Screen name="setup-dairy" options={title("nav.setup_dairy")} />
      <Stack.Screen name="dairy-onboarding" options={title("nav.setup_dairy")} />

      {/* Other livestock */}
      <Stack.Screen name="activity-goatery" options={titleNoHome("nav.activity_goatery")} />
      <Stack.Screen name="setup-goatery" options={title("nav.setup_goatery")} />
      <Stack.Screen name="activity-poultry" options={titleNoHome("nav.activity_poultry")} />
      <Stack.Screen name="setup-poultry" options={title("nav.setup_poultry")} />

      {/* Dairy logbook */}
      <Stack.Screen name="dairy-animals" options={title("nav.dairy_animals")} />
      <Stack.Screen name="dairy-logbook" options={title("nav.dairy_logbook")} />
      <Stack.Screen name="dairy-log-cost" options={title("nav.dairy_log_cost")} />
      <Stack.Screen name="dairy-log-revenue" options={title("nav.dairy_log_revenue")} />
      <Stack.Screen name="dairy-breeding" options={title("nav.dairy_breeding")} />
      <Stack.Screen name="dairy-treatment" options={title("nav.dairy_treatment")} />
      <Stack.Screen name="dairy-pnl" options={title("nav.dairy_pnl")} />
    </Stack>
  );

  // Desktop: a persistent nav rail + a centred, max-width content frame around the
  // whole stack, so every screen (tabs and deep flows) reads as one desktop app.
  if (!isDesktop || isPreAuthRoute(pathname)) return stack;
  // Full-bleed header (app-bar) + each screen centres/caps its own content via
  // useContentMax — so the header spans the frame and content reads as a column.
  return (
    <View style={rootStyles.shell}>
      <DesktopSidebar />
      <View style={rootStyles.contentArea}>{stack}</View>
    </View>
  );
}

const rootStyles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", backgroundColor: "#eef1f0" },
  contentArea: { flex: 1 },
  sceneContent: { maxWidth: 680, width: "100%", alignSelf: "center" },
});

export default function RootLayout() {
  return (
    <LanguageProvider>
      <StatusBar style="light" />
      <Nav />
    </LanguageProvider>
  );
}
