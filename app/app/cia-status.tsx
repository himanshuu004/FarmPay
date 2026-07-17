/**
 * CIA — application status tracker. One honest timeline from EOI to loan closure,
 * derived from the append-only domain_events outbox (never a mutable log). Shows an
 * "as of" freshness stamp (last-synced, not pretend-live), the current step + what
 * happens next, a returned-for-correction reason with a fix CTA, and financials once
 * sanctioned. Owner-scoped read.
 *
 * Wired to GET /applications/:uuid/status. Reachable with an `app` param, or with none
 * (picks the farmer's latest application via GET /applications). Settled prototype:
 * prototypes/cattle-induction/farmer-status.html.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useContentMax } from "../lib/responsive";
import { getStatus, myApplications, FILLABLE_STATUSES } from "../lib/ciaApi";
import type { CiaStatus, CiaApp } from "../lib/ciaApi";

// Canonical lifecycle milestones (farmer-legible). Each maps one or more backend
// statuses → a single visible step; money/purchase steps light up in CIA-2/3.
const STEPS: { key: string; statuses: string[]; who: string }[] = [
  { key: "interest", statuses: ["INTEREST_SUBMITTED"], who: "you" },
  { key: "dcs_review", statuses: ["PENDING_DCS_REVIEW"], who: "dcs" },
  { key: "selected", statuses: ["SELECTED_BY_DCS"], who: "board" },
  { key: "application", statuses: ["APPLICATION_PENDING", "DOCUMENTS_INCOMPLETE", "RETURNED_FOR_CORRECTION"], who: "you" },
  { key: "verify", statuses: ["PENDING_SUPERVISOR_VERIFY"], who: "supervisor" },
  { key: "duss", statuses: ["FORWARDED_TO_DUSS", "UNDER_DUSS_SCRUTINY"], who: "duss" },
  { key: "bank", statuses: ["SUBMITTED_TO_BANK", "UNDER_BANK_APPRAISAL", "BANK_QUERY_RAISED"], who: "bank" },
  { key: "sanctioned", statuses: ["LOAN_SANCTIONED"], who: "bank" },
  { key: "disbursed", statuses: ["SUBSIDY_TRANSFERRED", "LOAN_DISBURSED"], who: "bank" },
  { key: "purchase", statuses: ["CATTLE_PURCHASE_PENDING", "PURCHASE_INITIATED", "SELLER_PAID"], who: "you" },
  { key: "emi", statuses: ["EMI_ACTIVE", "EMI_OVERDUE", "LOAN_RESTRUCTURED"], who: "you" },
  { key: "closed", statuses: ["LOAN_CLOSED", "APPLICATION_CLOSED"], who: "bank" },
];
const stepIndexOf = (status: string) => STEPS.findIndex((s) => s.statuses.includes(status));

// Terminal-negative statuses attach to a step but render as "declined".
const DECLINED: Record<string, { at: number; key: string }> = {
  NOT_SELECTED: { at: 2, key: "not_selected" },
  LOAN_REJECTED: { at: 7, key: "rejected" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function asOfLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const hh = d.getHours(); const mm = String(d.getMinutes()).padStart(2, "0");
  const ap = hh < 12 ? "AM" : "PM"; const h12 = hh % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h12}:${mm} ${ap}`;
}

export default function CiaStatus() {
  const router = useRouter();
  const { t } = useI18n();
  const cmax = useContentMax();
  const { app } = useLocalSearchParams<{ app?: string }>();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [none, setNone] = useState(false);
  const [st, setSt] = useState<CiaStatus | null>(null);
  const [meta, setMeta] = useState<CiaApp | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(false); setNone(false);
    try {
      let uuid = app || null;
      if (!uuid) {
        const apps = await myApplications();
        if (!apps.length) { setNone(true); setLoading(false); return; }
        setMeta(apps[0]);            // rows are id DESC → latest first
        uuid = apps[0].applicationUuid;
      }
      const s = uuid ? await getStatus(uuid) : null;
      if (!s) setErr(true); else setSt(s);
    } catch { setErr(true); }
    setLoading(false);
  }, [app]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  if (none) {
    return (
      <View style={styles.center}>
        <Text style={styles.art}>🐄</Text>
        <Text style={styles.muted}>{t("cia.st.none")}</Text>
        <TouchableOpacity style={styles.big} onPress={() => router.replace("/cia-schemes")}>
          <Text style={styles.bigTxt}>{t("cia.st.browse")}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (err || !st) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("cia.load_error")}</Text>
        <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryTxt}>{t("cia.retry")}</Text></TouchableOpacity>
      </View>
    );
  }

  const declined = DECLINED[st.status] || null;
  const curIdx = declined ? declined.at : stepIndexOf(st.status);
  const fillable = FILLABLE_STATUSES.includes(st.status);
  const returned = st.status === "RETURNED_FOR_CORRECTION" || st.status === "DOCUMENTS_INCOMPLETE";
  const purchasing = st.purchaseUnlocked === true || st.status === "PURCHASE_INITIATED";
  const inRepayment = ["SELLER_PAID", "EMI_ACTIVE", "EMI_OVERDUE", "LOAN_RESTRUCTURED", "LOAN_CLOSED"].includes(st.status);

  // Earliest timestamp per visible step, from the domain_events timeline.
  const stampAt: Record<number, string> = {};
  for (const e of st.timeline || []) {
    if (!e.status) continue;
    const i = stepIndexOf(e.status);
    if (i >= 0 && !stampAt[i] && e.at) stampAt[i] = e.at;
  }

  const curLabel = curIdx >= 0 ? t(`cia.step.${STEPS[curIdx].key}`) : st.status;
  const fin = st.financials || st.subsidyTransfer || st.disbursement;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, cmax]}>
      {/* freshness — honest last-synced stamp */}
      <View style={styles.asof}>
        <Text style={styles.asofTxt}>{t("cia.st.as_of")} {asOfLabel(st.asOf)}</Text>
        {meta?.dcsRef ? <Text style={styles.asofDcs}>{meta.dcsRef}</Text> : null}
      </View>

      {/* current step hero */}
      <View style={[styles.now, declined && styles.nowBad]}>
        <Text style={styles.nowLab}>{t("cia.st.current")}</Text>
        <Text style={[styles.nowSt, declined && styles.nowStBad]}>{curLabel}</Text>
        {st.nextStep ? <Text style={styles.nowNx}>{t("cia.st.next")}: {st.nextStep}</Text> : null}
        {fillable ? (
          <TouchableOpacity style={styles.cta} onPress={() => router.push("/cia-application" as any)}>
            <Text style={styles.ctaTxt}>{returned ? t("cia.st.fix") : t("cia.st.complete")} →</Text>
          </TouchableOpacity>
        ) : purchasing ? (
          <TouchableOpacity style={styles.cta} onPress={() => router.push("/cia-purchase" as any)}>
            <Text style={styles.ctaTxt}>{t("cia.pur.buy_hero")} →</Text>
          </TouchableOpacity>
        ) : inRepayment ? (
          <TouchableOpacity style={styles.cta} onPress={() => router.push("/cia-emi" as any)}>
            <Text style={styles.ctaTxt}>{t("nav.cia_emi")} →</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* financials — appear once sanctioned (CIA-2); tap → full loan & subsidy detail */}
      {fin ? (
        <TouchableOpacity style={styles.fin} activeOpacity={0.85} onPress={() => router.push("/cia-loan" as any)}>
          <View style={styles.finTop}>
            <Text style={styles.finH}>{t("cia.st.financials")}</Text>
            <Text style={styles.finMore}>{t("cia.loan.details")} →</Text>
          </View>
          {st.subsidyTransfer ? (
            <View style={styles.finRow}>
              <Text style={styles.finL}>{t("cia.st.subsidy")}</Text>
              <Text style={styles.finV}>{formatRupees(st.subsidyTransfer.amount)}</Text>
            </View>
          ) : null}
          {st.disbursement ? (
            <>
              <View style={styles.finRow}>
                <Text style={styles.finL}>{t("cia.st.loan")}</Text>
                <Text style={styles.finV}>{formatRupees(st.disbursement.amount)}</Text>
              </View>
              <View style={styles.finRow}>
                <Text style={styles.finL}>{t("cia.st.loan_ac")}</Text>
                <Text style={styles.finV}>{st.disbursement.loanAccount}</Text>
              </View>
            </>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {/* timeline */}
      <View style={styles.tl}>
        {STEPS.map((s, i) => {
          const state = i < curIdx ? "done" : i === curIdx ? (declined ? "bad" : "now") : "future";
          const stamp = stampAt[i];
          const sub = state === "future"
            ? t("cia.st.pending")
            : (stamp ? `${shortDate(stamp)} · ${t(`cia.who.${s.who}`)}` : t(`cia.who.${s.who}`));
          return (
            <View key={s.key} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <View style={[
                  styles.dot,
                  state === "done" && styles.dotDone,
                  state === "now" && styles.dotNow,
                  state === "bad" && styles.dotBad,
                ]} />
                {i < STEPS.length - 1 ? <View style={[styles.line, i < curIdx && styles.lineDone]} /> : null}
              </View>
              <View style={styles.tlBody}>
                <Text style={[styles.tlH, state === "future" && styles.tlFuture, state === "now" && styles.tlNowH]}>
                  {t(`cia.step.${s.key}`)}
                </Text>
                <Text style={[styles.tlT, state === "future" && styles.tlFuture]}>{sub}</Text>
                {state === "now" && returned && st.returnedFor ? (
                  <View style={styles.warn}>
                    <Text style={styles.warnTxt}>↩ {t("cia.st.returned")} — "{st.returnedFor.reason}"</Text>
                  </View>
                ) : null}
                {state === "bad" ? (
                  <View style={styles.bad}>
                    <Text style={styles.badTxt}>{t(`cia.st.${declined!.key}`)}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 28 },
  art: { fontSize: 48, marginBottom: 8 },
  muted: { color: "#888", fontSize: 14, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: "#2e7d32", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt: { color: "#fff", fontWeight: "700" },
  big: { backgroundColor: "#2e7d32", borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13, marginTop: 18 },
  bigTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },

  asof: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#e6f0f6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  asofTxt: { color: "#0b5c8a", fontSize: 12.5, fontWeight: "600" },
  asofDcs: { color: "#0b5c8a", fontSize: 12, fontWeight: "800" },

  now: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8e4", padding: 14, marginBottom: 16 },
  nowBad: { borderColor: "#f1c7c1", backgroundColor: "#fdf3f2" },
  nowLab: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, color: "#888" },
  nowSt: { fontSize: 19, fontWeight: "800", color: "#0a5c3a", marginTop: 2 },
  nowStBad: { color: "#b42318" },
  nowNx: { fontSize: 13.5, color: "#6b7c74", marginTop: 4, lineHeight: 19 },
  cta: { backgroundColor: "#2e7d32", borderRadius: 10, paddingVertical: 11, alignItems: "center", marginTop: 12 },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },

  fin: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8e4", padding: 14, marginBottom: 16 },
  finTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  finH: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, color: "#888" },
  finMore: { fontSize: 12, fontWeight: "800", color: "#0a5c3a" },
  finRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  finL: { fontSize: 13.5, color: "#6b7c74" },
  finV: { fontSize: 14, fontWeight: "800", color: "#14201b" },

  tl: { paddingLeft: 2 },
  tlRow: { flexDirection: "row", gap: 12 },
  tlRail: { width: 18, alignItems: "center" },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#c3ccc7", marginTop: 3 },
  dotDone: { backgroundColor: "#0f7a4d" },
  dotNow: { backgroundColor: "#fff", borderWidth: 3, borderColor: "#0f7a4d", width: 16, height: 16, borderRadius: 8 },
  dotBad: { backgroundColor: "#b42318" },
  line: { flex: 1, width: 2, backgroundColor: "#e2e8e4", marginTop: 2, minHeight: 22 },
  lineDone: { backgroundColor: "#0f7a4d" },
  tlBody: { flex: 1, paddingBottom: 18 },
  tlH: { fontSize: 14.5, fontWeight: "700", color: "#14201b" },
  tlNowH: { color: "#0a5c3a" },
  tlT: { fontSize: 12.5, color: "#6b7c74", marginTop: 1 },
  tlFuture: { opacity: 0.5 },
  warn: { backgroundColor: "#fef3e2", borderWidth: 1, borderColor: "#f3e2c8", borderRadius: 8, padding: 8, marginTop: 6 },
  warnTxt: { color: "#b45309", fontSize: 12, fontWeight: "600" },
  bad: { backgroundColor: "#fdecea", borderRadius: 8, padding: 8, marginTop: 6 },
  badTxt: { color: "#b42318", fontSize: 12, fontWeight: "700" },
});
