/**
 * CIA — one scheme's detail (terms + document checklist), read-only. The two CTAs
 * carry the schemeVersion into the per-scheme eligibility check and the EOI.
 * Wired to GET /cattle-induction/schemes/:version.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { getScheme } from "../lib/ciaApi";
import type { CiaScheme, CiaDoc } from "../lib/ciaApi";

const DOC_ICON: Record<string, string> = {
  aadhaar: "🪪", bank_passbook: "🏦", photo: "🧑", caste_cert: "📜", land_shed: "🏠",
};

function Fact({ v, l }: { v: string; l: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factV}>{v}</Text>
      <Text style={styles.factL}>{l}</Text>
    </View>
  );
}

export default function CiaScheme() {
  const router = useRouter();
  const { t } = useI18n();
  const { scheme } = useLocalSearchParams<{ scheme?: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CiaScheme | null>(null);

  const load = useCallback(async () => {
    if (!scheme) { setLoading(false); return; }
    setLoading(true);
    try { setData(await getScheme(scheme)); } catch {}
    setLoading(false);
  }, [scheme]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (!data) return <View style={styles.center}><Text style={styles.muted}>{t("cia.load_error")}</Text></View>;

  const r = data.rules || {};
  const docs: CiaDoc[] = data.documentChecklist || [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{data.title || data.schemeVersion}</Text>
        <Text style={styles.heroVer}>{data.schemeVersion}</Text>
      </View>

      <Text style={styles.sec}>{t("cia.scheme.what_you_get")}</Text>
      <View style={styles.grid}>
        <Fact v={`${r.subsidyPct ?? "—"}%`} l={t("cia.scheme.subsidy_on_animal")} />
        <Fact v={`${r.beneficiaryContributionPct ?? "—"}%`} l={t("cia.scheme.your_contribution")} />
        <Fact v={formatRupees(r.priceCeiling)} l={t("cia.scheme.price_ceiling")} />
        <Fact v={`${t("cia.scheme.up_to")} ${r.maxCattlePerBeneficiary ?? "—"}`} l={t("cia.scheme.per_member")} />
      </View>

      <Text style={styles.sec}>{t("cia.scheme.who_can_apply")}</Text>
      <View style={styles.grid}>
        <Fact v={`${r.minMembershipMonths ?? 0} ${t("cia.scheme.months")}`} l={t("cia.scheme.min_membership")} />
        <Fact v={`${formatRupees(r.minAvgMonthlyMilkValue)}+`} l={t("cia.scheme.min_milk")} />
      </View>

      <Text style={styles.sec}>{t("cia.scheme.what_needed")}</Text>
      {docs.map((d) => (
        <View key={d.key} style={styles.doc}>
          <Text style={styles.docIc}>{DOC_ICON[d.key] || "📄"}</Text>
          <Text style={styles.docLabel}>{d.label}</Text>
          <Text style={[styles.docReq, d.required === "OPTIONAL" ? styles.docOpt : styles.docMand]}>{d.required}</Text>
        </View>
      ))}

      <View style={styles.cta}>
        <TouchableOpacity
          style={styles.primary}
          onPress={() => router.push({ pathname: "/cia-eligibility", params: { scheme: data.schemeVersion } } as any)}
        >
          <Text style={styles.primaryTxt}>{t("cia.scheme.check_eligibility")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghost}
          onPress={() => router.push({ pathname: "/cia-eoi", params: { scheme: data.schemeVersion } } as any)}
        >
          <Text style={styles.ghostTxt}>{t("cia.scheme.interested")}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  muted: { color: "#888", fontSize: 13 },
  hero: { backgroundColor: "#1b5e20", borderRadius: 16, padding: 16, marginBottom: 14 },
  heroTitle: { color: "#fff", fontSize: 19, fontWeight: "800", lineHeight: 25 },
  heroVer: { color: "#cdeeda", fontSize: 11, fontWeight: "700", marginTop: 8 },
  sec: { fontSize: 12, color: "#888", fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 14 },
  fact: { backgroundColor: "#fff", borderRadius: 12, padding: 11, borderWidth: 1, borderColor: "#eee", flexGrow: 1, flexBasis: "46%" },
  factV: { fontSize: 18, fontWeight: "800", color: "#1b5e20" },
  factL: { fontSize: 11, color: "#888", fontWeight: "700", textTransform: "uppercase", marginTop: 2 },
  doc: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 11, padding: 10, borderWidth: 1, borderColor: "#eee", marginBottom: 7 },
  docIc: { fontSize: 18 },
  docLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: "#333" },
  docReq: { fontSize: 10, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, overflow: "hidden" },
  docMand: { backgroundColor: "#fdeeec", color: "#b42318" },
  docOpt: { backgroundColor: "#e6f0f6", color: "#0b5c8a" },
  cta: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 24 },
  primary: { flex: 1, backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center" },
  primaryTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  ghost: { borderWidth: 1, borderColor: "#cfe0d6", backgroundColor: "#fff", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" },
  ghostTxt: { color: "#1b5e20", fontSize: 15, fontWeight: "700" },
});
