/**
 * CIA — loan & subsidy status. Once the bank sanctions, the farmer sees the money
 * breakdown (sanctioned = subsidy + bank loan + own contribution, all from scheme
 * config) and watches subsidy → disbursement land. When the loan is disbursed the
 * guided purchase unlocks — this screen carries the "Start cattle purchase" CTA.
 *
 * Reuses GET /applications/:uuid/status (the financials block). "As of" freshness.
 * Reachable with an `app` param or none. Settled prototype: farmer-loan-status.html.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useContentMax } from "../lib/responsive";
import { getStatus, myApplications, CiaStatus } from "../lib/ciaApi";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default function CiaLoan() {
  const router = useRouter();
  const { t } = useI18n();
  const cmax = useContentMax();
  const { app } = useLocalSearchParams<{ app?: string }>();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [st, setSt] = useState<CiaStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(false);
    try {
      let id = app || null;
      if (!id) {
        const apps = await myApplications();
        if (!apps.length) { setErr(true); setLoading(false); return; }
        id = apps[0].applicationUuid;
      }
      const s = id ? await getStatus(id) : null;
      if (!s) setErr(true); else setSt(s);
    } catch { setErr(true); }
    setLoading(false);
  }, [app]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (err || !st) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("cia.load_error")}</Text>
        <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryTxt}>{t("cia.retry")}</Text></TouchableOpacity>
      </View>
    );
  }

  const fin = st.financials;
  if (!fin) {
    return (
      <View style={styles.center}>
        <Text style={styles.art}>🏦</Text>
        <Text style={styles.muted}>{t("cia.loan.not_sanctioned")}</Text>
      </View>
    );
  }

  // mini-timeline state
  const hasSubsidy = !!st.subsidyTransfer;
  const hasDisb = !!st.disbursement;
  const ready = st.purchaseUnlocked === true || ["CATTLE_PURCHASE_PENDING", "PURCHASE_INITIATED"].includes(st.status);
  const stage = ready ? 3 : hasDisb ? 2 : hasSubsidy ? 1 : 0;
  const STAGES = [
    { h: t("cia.loan.st_sanctioned"), sub: shortDate(st.asOf) },
    { h: t("cia.loan.st_subsidy"), sub: st.subsidyTransfer ? shortDate(st.subsidyTransfer.recordedAt) : "DUSS → " + t("cia.emi.c_bank") },
    { h: t("cia.loan.st_disbursed"), sub: t("cia.loan.to_loan_ac") },
    { h: t("cia.loan.st_ready"), sub: "" },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, cmax]}>
      <View style={styles.asof}>
        <Text style={styles.asofTxt}>{t("cia.emi.as_of")}</Text>
        {st.disbursement?.loanAccount ? <Text style={styles.asofAc}>{t("cia.emi.loan_ac")} {st.disbursement.loanAccount}</Text> : null}
      </View>

      {/* money breakdown */}
      <View style={styles.money}>
        <Text style={styles.big}>{formatRupees(fin.sanctionedAmount)} <Text style={styles.bigSub}>{t("cia.loan.sanctioned")}</Text></Text>
        <View style={styles.split}>
          <Row label={t("cia.loan.subsidy")} value={formatRupees(fin.subsidyAmount)} pct={fin.subsidyPct} />
          <Row label={t("cia.loan.component")} value={formatRupees(fin.loanComponent)} />
          <Row label={t("cia.loan.contribution")} value={formatRupees(fin.farmerContribution)} pct={fin.beneficiaryContributionPct} />
        </View>
      </View>

      {/* subsidy → disbursed timeline */}
      <View style={styles.tl}>
        {STAGES.map((s, i) => {
          const state = i < stage ? "done" : i === stage ? "now" : "future";
          return (
            <View key={i} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <View style={[styles.dot, state === "done" && styles.dotDone, state === "now" && styles.dotNow]} />
                {i < STAGES.length - 1 ? <View style={[styles.line, i < stage && styles.lineDone]} /> : null}
              </View>
              <View style={styles.tlBody}>
                <Text style={[styles.tlH, state === "future" && styles.future, state === "now" && styles.tlNow]}>{s.h}</Text>
                <Text style={[styles.tlT, state === "future" && styles.future]}>{state === "future" ? t("cia.loan.pending") : s.sub}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {ready ? (
        <TouchableOpacity style={styles.cta} onPress={() => router.push("/cia-purchase" as any)}>
          <Text style={styles.ctaTxt}>{t("cia.loan.start_purchase")} →</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, pct }: { label: string; value: string; pct?: number }) {
  return (
    <View style={styles.r}>
      <Text style={styles.rL}>{label}{pct ? ` · ${pct}%` : ""}</Text>
      <Text style={styles.rV}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 28 },
  art: { fontSize: 46, marginBottom: 8 },
  muted: { color: "#888", fontSize: 14, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: "#2e7d32", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt: { color: "#fff", fontWeight: "700" },

  asof: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#e6f0f6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  asofTxt: { color: "#0b5c8a", fontSize: 12, fontWeight: "600", flex: 1 },
  asofAc: { color: "#0b5c8a", fontSize: 11.5, fontWeight: "800" },

  money: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8e4", borderRadius: 14, padding: 16, marginBottom: 14 },
  big: { fontSize: 26, fontWeight: "800", color: "#0a5c3a" },
  bigSub: { fontSize: 13, fontWeight: "600", color: "#6b7c74" },
  split: { marginTop: 10 },
  r: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#eef2f0" },
  rL: { fontSize: 13, color: "#4a5852" },
  rV: { fontSize: 14, fontWeight: "800", color: "#14201b" },

  tl: { paddingLeft: 2, marginBottom: 8 },
  tlRow: { flexDirection: "row", gap: 12 },
  tlRail: { width: 18, alignItems: "center" },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#c3ccc7", marginTop: 3 },
  dotDone: { backgroundColor: "#0f7a4d" },
  dotNow: { backgroundColor: "#fff", borderWidth: 3, borderColor: "#0f7a4d", width: 16, height: 16, borderRadius: 8 },
  line: { flex: 1, width: 2, backgroundColor: "#e2e8e4", marginTop: 2, minHeight: 18 },
  lineDone: { backgroundColor: "#0f7a4d" },
  tlBody: { flex: 1, paddingBottom: 16 },
  tlH: { fontSize: 14, fontWeight: "700", color: "#14201b" },
  tlNow: { color: "#0a5c3a" },
  tlT: { fontSize: 12, color: "#6b7c74", marginTop: 1 },
  future: { opacity: 0.5 },

  cta: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 6 },
  ctaTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
