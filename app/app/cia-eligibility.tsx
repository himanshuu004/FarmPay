/**
 * CIA — non-binding eligibility check for one scheme. Advisory only, NEVER a sanction
 * (only the DCS board + bank decide). Renders the structured checks[] as ticks.
 * Wired to GET /cattle-induction/eligibility?scheme=.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useI18n } from "../lib/i18n";
import { checkEligibility } from "../lib/ciaApi";
import type { CiaEligibility } from "../lib/ciaApi";

export default function CiaEligibility() {
  const router = useRouter();
  const { t } = useI18n();
  const { scheme } = useLocalSearchParams<{ scheme?: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CiaEligibility | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await checkEligibility(scheme)); } catch {}
    setLoading(false);
  }, [scheme]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  // Non-member — nothing to check.
  if (data && data.isMember === false) {
    return <View style={styles.center}><Text style={styles.muted}>{t("cia.elig.link_membership")}</Text></View>;
  }
  if (!data) return <View style={styles.center}><Text style={styles.muted}>{t("cia.load_error")}</Text></View>;

  const eligible = data.likelyEligible === true;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.schemeChip}>
        <Text style={styles.schemeChipTxt}>{t("cia.elig.checking_for")} <Text style={styles.schemeChipB}>{data.schemeVersion || scheme}</Text></Text>
        <TouchableOpacity onPress={() => router.push("/cia-schemes")}><Text style={styles.change}>{t("cia.elig.change")}</Text></TouchableOpacity>
      </View>

      <View style={[styles.banner, eligible ? styles.bannerOk : styles.bannerNo]}>
        <Text style={[styles.bannerBig, eligible ? styles.okInk : styles.noInk]}>
          {eligible ? `✓ ${t("cia.elig.likely")}` : t("cia.elig.not_yet")}
        </Text>
        <Text style={styles.bannerSub}>
          {eligible ? t("cia.elig.likely_sub") : (data.reasons || []).join(" · ")}
        </Text>
        <Text style={styles.advBadge}>⚖ {t("cia.elig.guide")}</Text>
      </View>

      {(data.checks || []).map((c) => (
        <View key={c.key} style={styles.check}>
          <View style={[styles.checkIc, c.ok ? styles.icOk : styles.icBad]}>
            <Text style={[styles.checkIcTxt, c.ok ? styles.okInk : styles.badInk]}>{c.ok ? "✓" : "✕"}</Text>
          </View>
          <View style={styles.checkBody}>
            <Text style={styles.checkLabel}>{c.label}</Text>
            <Text style={styles.checkDetail}>{c.detail}</Text>
          </View>
          <Text style={styles.checkSrc}>{c.src}</Text>
        </View>
      ))}

      <TouchableOpacity
        style={styles.btn}
        onPress={() => router.push({ pathname: "/cia-eoi", params: { scheme: data.schemeVersion || scheme } } as any)}
      >
        <Text style={styles.btnTxt}>{t("cia.elig.express")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 24 },
  muted: { color: "#888", fontSize: 14, textAlign: "center" },
  schemeChip: { flexDirection: "row", alignItems: "center", backgroundColor: "#e8f5ee", borderWidth: 1, borderColor: "#cfe8da", borderRadius: 12, padding: 11, marginBottom: 12 },
  schemeChipTxt: { flex: 1, fontSize: 13, color: "#333" },
  schemeChipB: { color: "#1b5e20", fontWeight: "700" },
  change: { color: "#1b5e20", fontWeight: "800", fontSize: 13 },
  banner: { borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1 },
  bannerOk: { backgroundColor: "#e9f8ef", borderColor: "#bfe3cf" },
  bannerNo: { backgroundColor: "#fef3e2", borderColor: "#f3e2c8" },
  bannerBig: { fontSize: 18, fontWeight: "800" },
  bannerSub: { fontSize: 13, color: "#666", marginTop: 4 },
  advBadge: { alignSelf: "flex-start", fontSize: 11, fontWeight: "800", color: "#888", backgroundColor: "#fff", borderWidth: 1, borderColor: "#eee", borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3, marginTop: 10, overflow: "hidden" },
  okInk: { color: "#0a5c3a" },
  noInk: { color: "#b4530a" },
  badInk: { color: "#b42318" },
  check: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#fff", borderRadius: 12, padding: 11, borderWidth: 1, borderColor: "#eee", marginBottom: 8 },
  checkIc: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  icOk: { backgroundColor: "#d8f0e1" },
  icBad: { backgroundColor: "#fdeeec" },
  checkIcTxt: { fontSize: 15, fontWeight: "800" },
  checkBody: { flex: 1 },
  checkLabel: { fontSize: 14, fontWeight: "700", color: "#333" },
  checkDetail: { fontSize: 12.5, color: "#888" },
  checkSrc: { fontSize: 10, fontWeight: "800", color: "#0b5c8a", backgroundColor: "#e6f0f6", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, overflow: "hidden" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 6, marginBottom: 24 },
  btnTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
