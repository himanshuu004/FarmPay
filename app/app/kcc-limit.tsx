/**
 * KCC home — the composite KCC-AH journey, farmer-facing. Leads with the two
 * farmer actions (Calculate, Apply), then shows the society-mediated workflow as
 * an actor-grouped timeline (You → Society/Milk Union → Bank) with the current
 * step highlighted — so the farmer sees exactly who does what next.
 *   You ★ author calculate/apply/submit · Society ‡ certifies · Bank sanctions.
 * Wired to /api/v1/kcc/facility (+ /apply, /submit).
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

// Linear order used to decide which workflow steps are done.
const ORDER = ["DRAFT", "SUBMITTED", "SOCIETY_CERTIFIED", "UNDER_REVIEW", "FORWARDED_TO_BANK", "SANCTIONED", "DISBURSED", "ACTIVE"];
const idx = (s: string) => Math.max(0, ORDER.indexOf(s));

// The workflow, grouped by who acts. `at` = the status by which the step is done.
// `titleKey` resolves through i18n.
const STEPS: { actor: "YOU" | "SOCIETY" | "BANK" | "ONGOING"; titleKey: string; at: string }[] = [
  { actor: "YOU", titleKey: "kcc.step.calculate", at: "DRAFT" },
  { actor: "YOU", titleKey: "kcc.step.become_member", at: "DRAFT" },
  { actor: "YOU", titleKey: "kcc.step.fill_submit", at: "SUBMITTED" },
  { actor: "SOCIETY", titleKey: "kcc.step.secretary_helps", at: "SUBMITTED" },
  { actor: "SOCIETY", titleKey: "kcc.step.union_certifies", at: "SOCIETY_CERTIFIED" },
  { actor: "BANK", titleKey: "kcc.step.kyc_verified", at: "UNDER_REVIEW" },
  { actor: "BANK", titleKey: "kcc.step.limit_fixed", at: "UNDER_REVIEW" },
  { actor: "BANK", titleKey: "kcc.step.forms_to_bank", at: "FORWARDED_TO_BANK" },
  { actor: "BANK", titleKey: "kcc.step.sanction_disburse", at: "DISBURSED" },
  { actor: "ONGOING", titleKey: "kcc.step.ongoing_repay", at: "ACTIVE" },
];

const ACTOR = {
  YOU: { labelKey: "kcc.actor.you", color: "#0f7a4d", bg: "#e8f5e9" },
  SOCIETY: { labelKey: "kcc.actor.society", color: "#0b5c8a", bg: "#e6f0f6" },
  BANK: { labelKey: "kcc.actor.bank", color: "#7a4d0f", bg: "#f6efe6" },
  ONGOING: { labelKey: "kcc.actor.ongoing", color: "#555", bg: "#eee" },
};

export default function KccHome() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiGet("/kcc/facility"); if (res.success) setF(res.data); } catch (e) {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setBusy(true);
    try {
      const res = await apiPost(`/kcc/facility/${f.facilityUuid}/submit`, {});
      if (res.success) { Alert.alert(t("kcc.submitted_title"), t("kcc.submitted_msg")); load(); }
      else Alert.alert(t("kcc.not_submitted"), res.message || t("common.try_again"));
    } catch (e) { Alert.alert(t("common.error"), t("kcc.cannot_connect")); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  // ── No application yet → the two farmer actions + a preview of how it works ──
  if (!f?.hasFacility) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.h1}>{t("kcc.title_dairy")}</Text>
        <Text style={styles.lead}>{t("kcc.home_lead")}</Text>

        <TouchableOpacity style={[styles.action, styles.actionPrimary]} activeOpacity={0.85} onPress={() => router.push("/kcc-calculator")}>
          <Text style={styles.actionIcon}>🧮</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>{t("kcc.calc_my_limit")}</Text>
            <Text style={styles.actionSub}>{t("kcc.calc_sub")}</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.action, styles.actionApply]} activeOpacity={0.85} onPress={() => router.push("/kcc-apply")}>
          <Text style={styles.actionIcon}>📝</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, styles.applyText]}>{t("kcc.apply_kcc")}</Text>
            <Text style={[styles.actionSub, styles.applySub]}>{t("kcc.apply_sub")}</Text>
          </View>
          <Text style={[styles.actionArrow, styles.applyText]}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.link} onPress={() => router.push("/kcc-eligibility")}>
          <Text style={styles.linkText}>{t("kcc.check_eligibility")}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>{t("kcc.how_it_works")}</Text>
        <Timeline status={null} />
      </ScrollView>
    );
  }

  const status = f.status as string;
  const applied = f.status !== "DRAFT";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Limit / status */}
      <View style={styles.card}>
        <View style={styles.rowB}>
          <Text style={styles.cardTitle}>{status === "DRAFT" ? t("kcc.estimated_limit") : t("kcc.sanctioned_limit")}</Text>
          <Text style={styles.badge}>{status.replace(/_/g, " ")}</Text>
        </View>
        <Text style={styles.cmpl}>{formatRupees(f.cmpl)}</Text>
        <Row label={t("kcc.cash_credit_st")} value={formatRupees(f.stSubLimit)} />
        <Row label={t("kcc.investment_lt")} value={formatRupees(f.ltSubLimit)} />
        {f.collateralFree ? (
          <Text style={styles.chipGood}>{t("kcc.collateral_free_upto")} {formatRupees(f.collateralFreeLimitApplied || 200000)}{t("kcc.upto_word") ? " " + t("kcc.upto_word") : ""}{f.tieupCertified ? t("kcc.tieup_ok") : f.tieupRequested ? t("kcc.tieup_requested") : ""}</Text>
        ) : null}
      </View>

      {/* The workflow */}
      <Text style={styles.sectionLabel}>{t("kcc.app_progress")}</Text>
      <Timeline status={status} />

      {/* Farmer action for the current state */}
      {status === "DRAFT" ? (
        <TouchableOpacity style={styles.submitBtn} disabled={busy} onPress={submit}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t("kcc.submit_to_society")}</Text>}
        </TouchableOpacity>
      ) : null}
      {["SUBMITTED", "SOCIETY_CERTIFIED", "UNDER_REVIEW", "FORWARDED_TO_BANK"].includes(status) ? (
        <View style={styles.waitCard}>
          <Text style={styles.waitText}>
            {status === "SUBMITTED" ? t("kcc.wait_submitted")
              : status === "SOCIETY_CERTIFIED" ? t("kcc.wait_certified")
              : t("kcc.wait_bank")}
          </Text>
        </View>
      ) : null}

      {/* Submitted application summary */}
      {applied ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("kcc.your_application")}</Text>
          {f.bankAccountRef ? <Row label={t("kcc.dbt_account")} value={`••••${String(f.bankAccountRef).slice(-4)}`} /> : null}
          <Row label={t("kcc.milk_union_tieup")} value={f.tieupRequested ? t("kcc.tieup_req_value") : t("kcc.no")} />
          {f.kyc ? <Row label={t("kcc.kyc_ready")} value={`${Object.values(f.kyc).filter(Boolean).length}/4 ${t("kcc.documents_word")}`} /> : null}
          {f.repaymentConsent?.tripartite ? <Row label={t("kcc.tripartite")} value={t("kcc.agreed")} /> : null}
        </View>
      ) : null}

      {/* ACTIVE features */}
      {["DISBURSED", "ACTIVE"].includes(status) ? (
        <>
          <TouchableOpacity style={styles.btnGhost} onPress={() => router.push("/kcc-drawdown")}><Text style={styles.btnGhostText}>{t("kcc.buy_animal_equip")}</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={() => router.push("/kcc-pack")}><Text style={styles.btnGhostText}>{t("kcc.view_banker_pack")}</Text></TouchableOpacity>
        </>
      ) : null}

      <TouchableOpacity style={styles.link} onPress={() => router.push("/kcc-calculator")}><Text style={styles.linkText}>{t("kcc.recalculate")}</Text></TouchableOpacity>
    </ScrollView>
  );
}

function Timeline({ status }: { status: string | null }) {
  const { t } = useI18n();
  const cur = status ? idx(status) : -1;
  return (
    <View style={styles.card}>
      {STEPS.map((s, i) => {
        const done = cur >= 0 && cur >= idx(s.at) && !(status === "DRAFT" && s.at !== "DRAFT");
        // current = first not-done step
        const firstPending = STEPS.findIndex((x) => !(cur >= 0 && cur >= idx(x.at) && !(status === "DRAFT" && x.at !== "DRAFT")));
        const current = i === firstPending && cur >= 0;
        const a = ACTOR[s.actor];
        return (
          <View key={i} style={styles.step}>
            <View style={[styles.dot, done && styles.dotDone, current && styles.dotNow]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepTitle, done && styles.stepDone, current && styles.stepNow]}>{t(s.titleKey)}</Text>
              <Text style={[styles.actorTag, { color: a.color, backgroundColor: a.bg }]}>{t(a.labelKey)}</Text>
            </View>
            {done ? <Text style={styles.tick}>✓</Text> : current ? <Text style={styles.now}>●</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowVal}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  h1: { fontSize: 22, fontWeight: "800", color: "#1b5e20" },
  lead: { fontSize: 13, color: "#777", marginTop: 4, marginBottom: 16, lineHeight: 19 },

  action: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 18, marginBottom: 12 },
  actionPrimary: { backgroundColor: "#0f7a4d" },
  actionApply: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#0f7a4d" },
  actionIcon: { fontSize: 30 },
  actionTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  actionSub: { fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  actionArrow: { fontSize: 26, color: "rgba(255,255,255,0.8)" },
  applyText: { color: "#0f7a4d" },
  applySub: { color: "#2e7d32" },

  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: "700" },
  rowB: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { fontSize: 11, fontWeight: "800", color: "#0b5c8a", backgroundColor: "#e6f0f6", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  cmpl: { fontSize: 30, fontWeight: "800", color: "#1b5e20", marginVertical: 6 },
  chipGood: { alignSelf: "flex-start", fontSize: 12, fontWeight: "700", color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginTop: 8, overflow: "hidden" },

  sectionLabel: { fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginTop: 8, marginBottom: 8 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f4f4f4" },
  dot: { width: 12, height: 12, borderRadius: 999, backgroundColor: "#ddd", marginTop: 3 },
  dotDone: { backgroundColor: "#2e7d32" },
  dotNow: { backgroundColor: "#e08a1e" },
  stepTitle: { fontSize: 13.5, color: "#666", lineHeight: 18 },
  stepDone: { color: "#333" },
  stepNow: { color: "#1b5e20", fontWeight: "800" },
  actorTag: { alignSelf: "flex-start", fontSize: 10, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, marginTop: 4, overflow: "hidden" },
  tick: { color: "#2e7d32", fontWeight: "800", fontSize: 15 },
  now: { color: "#e08a1e", fontWeight: "800", fontSize: 14 },

  submitBtn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 15, alignItems: "center", marginBottom: 12 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  waitCard: { backgroundColor: "#fff8ec", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#f0dcc0" },
  waitText: { color: "#8a5a12", fontSize: 13, lineHeight: 19, fontWeight: "600" },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#444" },
  rowVal: { fontSize: 14, color: "#222", fontWeight: "700" },

  btnGhost: { backgroundColor: "#e8f5e9", borderRadius: 12, padding: 13, alignItems: "center", marginBottom: 10 },
  btnGhostText: { color: "#1b5e20", fontSize: 15, fontWeight: "700" },
  link: { marginTop: 6, padding: 10, alignItems: "center" },
  linkText: { color: "#2e7d32", fontSize: 14, fontWeight: "700" },
});
