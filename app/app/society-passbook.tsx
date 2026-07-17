/**
 * Society milk passbook — THE WEDGE (V1 GTM). The only daily-pull surface: milk
 * from the ERP mirror (zero data entry) + the 70%-of-payables input-credit meter.
 * Non-members get the join-society nudge (the acquisition funnel), never a wall.
 * Wired to /api/v1/coop.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

export default function SocietyPassbook() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [pb, setPb] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet("/coop/passbook");
      if (res.success) setPb(res.data);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  }

  // Non-member → join-society nudge.
  if (pb && pb.isMember === false) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
        <View style={styles.nudge}>
          <Text style={styles.nudgeTitle}>{pb.nudge?.title || t("soc.nudge_title")}</Text>
          <Text style={styles.nudgeBody}>{pb.nudge?.body || t("soc.nudge_body")}</Text>
          <TouchableOpacity style={styles.btn}><Text style={styles.btnText}>{pb.nudge?.cta || t("soc.nudge_cta")}</Text></TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const avail = pb?.availableOrderLimit ?? 0;
  const gross = pb?.grossOrderLimit || 1;
  const fill = Math.max(0, Math.min(1, avail / gross));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.label}>{t("soc.outstanding")}</Text>
        <Text style={styles.kpi}>{formatRupees(pb?.outstandingPayables ?? 0)}</Text>
        {pb?.freshness ? <Text style={styles.fresh}>{pb.freshness}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t("soc.input_credit")}</Text>
        <Text style={styles.kpiSm}>{formatRupees(avail)} <Text style={styles.muted}>{t("soc.available")}</Text></Text>
        <View style={styles.meter}><View style={[styles.meterFill, { width: `${fill * 100}%` }]} /></View>
        <Text style={styles.muted}>{t("soc.repaid_note")}</Text>
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => router.push("/society-order")}>
        <Text style={styles.btnText}>{t("soc.order_inputs")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btnGhost} onPress={() => router.push("/society-orders")}>
        <Text style={styles.btnGhostText}>{t("soc.my_orders")}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.kccCta} onPress={() => router.push("/kcc-limit")}>
        <Text style={styles.kccCtaTitle}>{t("soc.kcc_cta_title")}</Text>
        <Text style={styles.kccCtaText}>{t("soc.kcc_cta_text")}</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.label}>{t("soc.milk_supplied")}</Text>
        {(pb?.months || []).length === 0 ? (
          <Text style={styles.muted}>{t("soc.no_milk")}</Text>
        ) : (
          <>
            <View style={styles.rowH}>
              <Text style={[styles.th, { flex: 2 }]}>{t("soc.col_month")}</Text>
              <Text style={[styles.th, styles.r]}>{t("soc.col_litres")}</Text>
              <Text style={[styles.th, styles.r]}>{t("soc.col_value")}</Text>
            </View>
            {(pb.months || []).map((m: any, i: number) => (
              <View key={i} style={styles.rowH}>
                <Text style={[styles.td, { flex: 2 }]}>{m.period}</Text>
                <Text style={[styles.td, styles.r]}>{m.litres}</Text>
                <Text style={[styles.td, styles.r]}>{formatRupees(m.value)}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  label: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "600" },
  kpi: { fontSize: 30, fontWeight: "800", color: "#1b5e20" },
  kpiSm: { fontSize: 22, fontWeight: "800", color: "#1b5e20" },
  muted: { color: "#888", fontSize: 13 },
  fresh: { color: "#b4530a", fontSize: 12, marginTop: 4, fontWeight: "600" },
  meter: { height: 14, borderRadius: 999, backgroundColor: "#e8f0ea", overflow: "hidden", marginVertical: 8 },
  meterFill: { height: "100%", backgroundColor: "#2e7d32" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnGhost: { backgroundColor: "#e8f5e9", borderRadius: 12, padding: 12, alignItems: "center", marginBottom: 12 },
  btnGhostText: { color: "#1b5e20", fontSize: 15, fontWeight: "700" },
  kccCta: { backgroundColor: "#e6f0f6", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#cfe0ec" },
  kccCtaTitle: { fontSize: 16, fontWeight: "800", color: "#0b5c8a", marginBottom: 4 },
  kccCtaText: { fontSize: 13, color: "#0b5c8a", lineHeight: 18 },
  rowH: { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  th: { flex: 1, fontSize: 12, color: "#888", fontWeight: "600" },
  td: { flex: 1, fontSize: 14, color: "#222" },
  r: { textAlign: "right" },
  nudge: { backgroundColor: "#fff", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#e8f0ea" },
  nudgeTitle: { fontSize: 18, fontWeight: "800", color: "#1b5e20", marginBottom: 8 },
  nudgeBody: { fontSize: 14, color: "#555", lineHeight: 20, marginBottom: 16 },
});
