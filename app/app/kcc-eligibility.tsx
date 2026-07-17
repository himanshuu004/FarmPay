/**
 * KCC eligibility + TRUST — the 1000-pt score with SHAP-style reason codes.
 * Decision support only; the sanctioned number is always the engine's statutory
 * math. Wired to GET /api/v1/kcc/eligibility.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

const BAND_COLOR: Record<string, string> = {
  STRONG: "#1b5e20", ESTABLISHED: "#2e7d32", EMERGING: "#b4530a", THIN: "#b3261e",
};

export default function KccEligibility() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet("/kcc/eligibility");
      if (res.success) setData(res.data);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const trust = data?.trust;
  const band = trust?.band || "THIN";
  const fill = Math.max(0, Math.min(1, (trust?.score || 0) / (trust?.scale || 1000)));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.trust_score")}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.score}>{trust?.score ?? 0}</Text>
          <Text style={[styles.band, { backgroundColor: BAND_COLOR[band] }]}>{band}</Text>
        </View>
        <View style={styles.meter}><View style={[styles.meterFill, { width: `${fill * 100}%`, backgroundColor: BAND_COLOR[band] }]} /></View>
        <Text style={styles.muted}>{t("kcc.decision_support")}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.why")}</Text>
        {(trust?.reasonCodes || []).map((r: any, i: number) => (
          <View key={i} style={styles.row}>
            <Text style={styles.reasonLabel}>{r.direction === "positive" ? "✅ " : "• "}{r.label}</Text>
            <Text style={[styles.points, r.points > 0 && styles.pointsPos]}>{r.points > 0 ? `+${r.points}` : r.points}</Text>
          </View>
        ))}
        {trust?.pillarsPending?.length ? (
          <Text style={styles.muted}>{t("kcc.pillars_pending")} {trust.pillarsPending.join(" · ").toLowerCase()}.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.rowB}>
          <Text style={styles.reasonLabel}>{t("kcc.collateral_ceiling")}</Text>
          <Text style={styles.ceiling}>≤ {formatRupees(data?.collateralFreeCeiling ?? 200000)}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => router.push("/kcc-limit")}>
        <Text style={styles.btnText}>{t("kcc.apply_kcc")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  score: { fontSize: 34, fontWeight: "800", color: "#1b5e20" },
  band: { color: "#fff", fontSize: 13, fontWeight: "800", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, overflow: "hidden" },
  meter: { height: 14, borderRadius: 999, backgroundColor: "#e8f0ea", overflow: "hidden", marginVertical: 10 },
  meterFill: { height: "100%" },
  muted: { color: "#888", fontSize: 12, marginTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowB: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reasonLabel: { fontSize: 14, color: "#333", flex: 1, paddingRight: 8 },
  points: { fontSize: 14, fontWeight: "700", color: "#888", fontVariant: ["tabular-nums"] },
  pointsPos: { color: "#2e7d32" },
  ceiling: { fontSize: 16, fontWeight: "800", color: "#1b5e20" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 20 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
