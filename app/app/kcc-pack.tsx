/**
 * KCC application / renewal pack — the banker interface in v1. A generated
 * document from your data (zero re-paperwork). Wired to
 * GET /api/v1/kcc/facility/:uuid/pack.
 */
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

export default function KccPack() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [pack, setPack] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fac = await apiGet("/kcc/facility");
      if (!fac.success || !fac.data?.hasFacility) { setLoading(false); return; }
      const res = await apiGet(`/kcc/facility/${fac.data.facilityUuid}/pack`);
      if (res.success) setPack(res.data);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (!pack) return <View style={styles.center}><Text style={styles.muted}>{t("kcc.apply_first")}</Text></View>;

  const f = pack.facility;
  const dp = pack.drawingPower;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.docHeader}>
        <Text style={styles.docKind}>{pack.kind === "RENEWAL_PACK" ? t("kcc.renewal_pack") : t("kcc.application_pack")}</Text>
        <Text style={styles.docSub}>{pack.scheme?.version} · {pack.scheme?.stateCode} · {t("kcc.banker_interface_suffix")}</Text>
      </View>

      <Section title={t("kcc.applicant")}>
        <Row label={t("kcc.name")} value={pack.farmer?.name || "—"} />
        <Row label={t("kcc.mobile")} value={pack.farmer?.mobile || "—"} />
      </Section>

      <Section title={t("kcc.sanctioned_limit")}>
        <Row label={t("kcc.composite_mpl")} value={formatRupees(f.cmpl)} bold />
        <Row label={t("kcc.st_sublimit")} value={formatRupees(f.stSubLimit)} />
        <Row label={t("kcc.lt_sublimit")} value={formatRupees(f.ltSubLimit)} />
        <Row label={t("kcc.sixth_year_mpl")} value={formatRupees(f.mplFinal)} />
        <Row label={t("kcc.collateral_free_label")} value={f.collateralFree ? t("kcc.yes_2lakh") : t("kcc.no")} />
      </Section>

      <Section title={t("kcc.activities_title")}>
        {(pack.activities || []).map((a: any, i: number) => (
          <Row key={i} label={a.code} value={`${a.units} ${a.unitType}`} />
        ))}
      </Section>

      {dp ? (
        <Section title={t("kcc.drawing_power_title")}>
          <Row label={t("kcc.drawing_power")} value={formatRupees(dp.value)} bold />
          <Row label={t("kcc.milk_receivables")} value={formatRupees(dp.milkReceivables)} />
          <Row label={t("kcc.stocks")} value={formatRupees(dp.stocks)} />
        </Section>
      ) : null}

      <Text style={styles.footer}>{t("kcc.pack_footer")}</Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowVal, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  docHeader: { backgroundColor: "#e6f0f6", borderRadius: 12, padding: 16, marginBottom: 12 },
  docKind: { fontSize: 18, fontWeight: "800", color: "#0b5c8a" },
  docSub: { fontSize: 12, color: "#0b5c8a", marginTop: 2 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#444", flex: 1, paddingRight: 8 },
  rowVal: { fontSize: 14, color: "#222", fontWeight: "600", fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "800", color: "#1b5e20" },
  muted: { color: "#888", fontSize: 13 },
  footer: { fontSize: 12, color: "#888", lineHeight: 18, marginTop: 4, marginBottom: 20 },
});
