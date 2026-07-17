/**
 * Pashu Suraksha quote — NLM premium: farmer 15% / govt 85% (90:10 for
 * Uttarakhand), region ceilings, cattle-unit cap. Wired to GET /kavach/plans +
 * POST /kavach/quote.
 */
import { useState, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

export default function PashuQuote() {
  const router = useRouter();
  const { t } = useI18n();
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();
  const [plans, setPlans] = useState<any[]>([]);
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [marketValue, setMarketValue] = useState("60000");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await apiGet("/kavach/plans");
      if (res.success && res.data?.length) {
        setPlans(res.data);
        setPlanCode(res.data[0].plan_code);
      }
    })();
  }, []);

  const getQuote = async (code: string | null, mv: string) => {
    const val = parseFloat(mv);
    if (!code || !(val > 0)) { setQuote(null); return; }
    setLoading(true);
    try {
      const res = await apiPost("/kavach/quote", { planCode: code, marketValue: val });
      setQuote(res.success ? res.data : null);
    } catch (e) { setQuote(null); }
    setLoading(false);
  };

  useEffect(() => { if (planCode) getQuote(planCode, marketValue); }, [planCode]); // eslint-disable-line

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.quote.choose_plan")}</Text>
        <View style={styles.chipRow}>
          {plans.map((p) => (
            <TouchableOpacity key={p.plan_code} style={[styles.chip, planCode === p.plan_code && styles.chipSel]} onPress={() => setPlanCode(p.plan_code)}>
              <Text style={[styles.chipText, planCode === p.plan_code && styles.chipTextSel]}>{p.species}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>{t("pashu.quote.market_value")}</Text>
        <TextInput style={styles.input} keyboardType="number-pad" value={marketValue} onChangeText={setMarketValue} onBlur={() => getQuote(planCode, marketValue)} />
        <Text style={styles.muted}>{t("pashu.quote.region_note")}</Text>
      </View>

      {loading ? <ActivityIndicator size="large" color="#2e7d32" style={{ marginTop: 16 }} /> : null}

      {quote && !loading ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("pashu.quote.premium_pre")} ({quote.termMonths}-{t("pashu.quote.month_term")} {quote.statutoryCeilingPct}%)</Text>
            <Row label={t("pashu.quote.sum_insured")} value={formatRupees(quote.sumInsured)} />
            <Row label={t("pashu.quote.total_premium")} value={formatRupees(quote.premiumTotal)} />
            <Row label={t("pashu.quote.you_pay_15")} value={formatRupees(quote.farmerShare)} bold />
            <Row label={t("pashu.quote.govt_85")} value={formatRupees(quote.govtShare)} />
            <Text style={styles.muted}>{t("pashu.quote.cu_cap")} {quote.cu?.cap} · {t("pashu.quote.cu_using")} {quote.cu?.total}</Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => router.push({ pathname: "/pashu-enrol", params: { planCode: planCode!, marketValue, ...(animalId ? { animalId } : {}) } } as any)}>
            <Text style={styles.btnText}>{t("pashu.quote.insure_this")}</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <View style={styles.row}><Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text><Text style={[styles.rowVal, bold && styles.bold]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  label: { fontSize: 13, color: "#555", marginBottom: 6, fontWeight: "600" },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  chip: { borderRadius: 10, borderWidth: 1, borderColor: "#ddd", paddingVertical: 8, paddingHorizontal: 14 },
  chipSel: { backgroundColor: "#e8f5e9", borderColor: "#2e7d32" },
  chipText: { fontSize: 13, color: "#555" },
  chipTextSel: { color: "#1b5e20", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 8, backgroundColor: "#fafafa" },
  muted: { color: "#888", fontSize: 12, marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#444" },
  rowVal: { fontSize: 14, color: "#222", fontWeight: "600", fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "800", color: "#1b5e20" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 20 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
