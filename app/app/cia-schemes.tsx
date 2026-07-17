/**
 * CIA — schemes list. Several cattle-induction schemes can run at once; the member
 * browses them and opens one for details. Wired to GET /cattle-induction/schemes,
 * which annotates each with a per-scheme likelyEligible for this farmer.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { listSchemes, myApplications, FILLABLE_STATUSES, CiaScheme } from "../lib/ciaApi";

export default function CiaSchemes() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [schemes, setSchemes] = useState<CiaScheme[]>([]);
  const [hasFillable, setHasFillable] = useState(false);
  const [hasApp, setHasApp] = useState(false);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(false);
    try {
      const [list, apps] = await Promise.all([listSchemes(), myApplications()]);
      setSchemes(list);
      setHasApp(apps.length > 0);
      setHasFillable(apps.some((a) => FILLABLE_STATUSES.includes(a.status)));
    } catch { setErr(true); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (err) return (
    <View style={styles.center}>
      <Text style={styles.muted}>{t("cia.load_error")}</Text>
      <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryTxt}>{t("cia.retry")}</Text></TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      {hasFillable ? (
        <TouchableOpacity
          style={styles.banner}
          activeOpacity={0.85}
          onPress={() => router.push("/cia-status" as any)}
        >
          <Text style={styles.bannerTxt}>{t("cia.app.complete_prompt")}</Text>
          <Text style={styles.bannerArrow}>→</Text>
        </TouchableOpacity>
      ) : hasApp ? (
        <TouchableOpacity
          style={styles.trackLink}
          activeOpacity={0.85}
          onPress={() => router.push("/cia-status" as any)}
        >
          <Text style={styles.trackTxt}>{t("cia.app.track_prompt")} →</Text>
        </TouchableOpacity>
      ) : null}
      {schemes.length === 0 ? (
        <View style={styles.card}><Text style={styles.muted}>{t("cia.schemes.none")}</Text></View>
      ) : (
        <>
          <Text style={styles.count}>{schemes.length} {t("cia.schemes.open_count")}</Text>
          {schemes.map((s) => (
            <TouchableOpacity
              key={s.schemeVersion}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: "/cia-scheme", params: { scheme: s.schemeVersion } } as any)}
            >
              <View style={styles.top}>
                <Text style={styles.title}>{s.title || s.schemeVersion}</Text>
                <View style={styles.subsidyBox}>
                  <Text style={styles.subsidyPct}>{s.rules?.subsidyPct ?? "—"}%</Text>
                  <Text style={styles.subsidyLbl}>{t("cia.schemes.subsidy")}</Text>
                </View>
              </View>
              <View style={styles.facts}>
                <Text style={styles.fact}>{t("cia.schemes.ceiling")} <Text style={styles.factB}>{formatRupees(s.rules?.priceCeiling)}</Text></Text>
                <Text style={styles.fact}>{t("cia.schemes.max")} <Text style={styles.factB}>{s.rules?.maxCattlePerBeneficiary ?? "—"}</Text></Text>
                <Text style={styles.fact}>{t("cia.schemes.min")} <Text style={styles.factB}>{s.rules?.minMembershipMonths ?? 0}{t("cia.scheme.months")}</Text></Text>
              </View>
              <View style={styles.fitRow}>
                {s.likelyEligible === true ? (
                  <Text style={styles.fitOk}>✓ {t("cia.schemes.you_qualify")}</Text>
                ) : s.likelyEligible === false ? (
                  <Text style={styles.fitNo}>△ {t("cia.schemes.check_criteria")}</Text>
                ) : (
                  <Text style={styles.muted}> </Text>
                )}
                <Text style={styles.view}>{t("cia.schemes.view")} →</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 24 },
  count: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700", marginBottom: 10 },
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#1b5e20", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 14 },
  bannerTxt: { color: "#fff", fontSize: 14, fontWeight: "800", flex: 1, paddingRight: 10 },
  bannerArrow: { color: "#fff", fontSize: 18, fontWeight: "800" },
  trackLink: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfe0d6", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14, alignItems: "center" },
  trackTxt: { color: "#1b5e20", fontSize: 13.5, fontWeight: "800" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 16, fontWeight: "800", color: "#14201b", flex: 1, paddingRight: 10 },
  subsidyBox: { alignItems: "flex-end" },
  subsidyPct: { fontSize: 18, fontWeight: "800", color: "#1b5e20" },
  subsidyLbl: { fontSize: 9, color: "#888", fontWeight: "700", textTransform: "uppercase" },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 9 },
  fact: { fontSize: 12, color: "#888" },
  factB: { color: "#333", fontWeight: "700" },
  fitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 11 },
  fitOk: { fontSize: 13, fontWeight: "700", color: "#1b5e20" },
  fitNo: { fontSize: 13, fontWeight: "700", color: "#b4530a" },
  view: { fontSize: 13, fontWeight: "800", color: "#2e7d32" },
  muted: { color: "#888", fontSize: 13 },
  retry: { marginTop: 14, backgroundColor: "#2e7d32", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt: { color: "#fff", fontWeight: "700" },
});
