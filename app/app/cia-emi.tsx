/**
 * CIA — milk-payment EMI ledger. The honest recovery view: each instalment's EMI
 * due vs what was actually deducted from the farmer's milk payment and remitted to
 * the loan (reconciled from the ERP settlement file; classified paid / partial /
 * overdue / default). Shows the deduction mode (TRACK vs INITIATE) and routes to the
 * tri-partite consent screen that flips it. "As of" freshness, never pretend-live.
 *
 * Wired to GET /applications/:uuid/emi. Reachable with an `app` param or none (picks
 * the farmer's latest). Settled prototype: farmer-emi-ledger.html.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useContentMax } from "../lib/responsive";
import { getEmi, getNoDues, myApplications } from "../lib/ciaApi";
import type { CiaEmi, CiaEmiLedgerRow, CiaEmiInstallment } from "../lib/ciaApi";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const CHIP: Record<string, { style: any; key: string }> = {
  PAID: { style: "cPaid", key: "cia.emi.st_paid" },
  PARTIAL: { style: "cPart", key: "cia.emi.st_partial" },
  OVERDUE: { style: "cOver", key: "cia.emi.st_overdue" },
  DEFAULT: { style: "cOver", key: "cia.emi.st_default" },
  DUE: { style: "cDue", key: "cia.emi.st_due" },
  SCHEDULED: { style: "cDue", key: "cia.emi.st_scheduled" },
};

export default function CiaEmi() {
  const router = useRouter();
  const { t } = useI18n();
  const cmax = useContentMax();
  const { app } = useLocalSearchParams<{ app?: string }>();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [uuid, setUuid] = useState<string | null>(null);
  const [emi, setEmi] = useState<CiaEmi | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(false);
    try {
      let id = app || null;
      if (!id) {
        const apps = await myApplications();
        if (!apps.length) { setErr(true); setLoading(false); return; }
        id = apps[0].applicationUuid;
      }
      setUuid(id);
      const e = id ? await getEmi(id) : null;
      if (!e) setErr(true); else setEmi(e);
    } catch { setErr(true); }
    setLoading(false);
  }, [app]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (err || !emi) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("cia.load_error")}</Text>
        <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryTxt}>{t("cia.retry")}</Text></TouchableOpacity>
      </View>
    );
  }

  const initiate = emi.mode === "INITIATE";
  // Prefer the reconciled ledger; fall back to the gross schedule before the first reconcile.
  const hasLedger = emi.ledger && emi.ledger.length > 0;
  const closed = emi.installments > 0 && emi.outstanding <= 0 && hasLedger;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, cmax]}>
      <View style={styles.asof}>
        <Text style={styles.asofTxt}>{t("cia.emi.as_of")}</Text>
        {emi.loanAccount ? <Text style={styles.asofAc}>{t("cia.emi.loan_ac")} {emi.loanAccount}</Text> : null}
      </View>

      {/* mode banner */}
      <View style={[styles.mode, initiate ? styles.modeOn : styles.modeOff]}>
        <Text style={[styles.modeTxt, initiate ? styles.modeTxtOn : styles.modeTxtOff]}>
          {initiate ? "✓ " : "🔒 "}{initiate ? t("cia.emi.mode_initiate") : t("cia.emi.mode_track")}
        </Text>
      </View>

      {/* outstanding + next */}
      <View style={styles.out}>
        <View>
          <Text style={styles.outV}>{formatRupees(emi.outstanding)}</Text>
          <Text style={styles.outL}>{t("cia.emi.outstanding")}</Text>
        </View>
        {emi.nextEmi ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.outL}>{t("cia.emi.next")}</Text>
            <Text style={styles.nextV}>{formatRupees(emi.nextEmi.amount)}</Text>
          </View>
        ) : null}
      </View>

      {emi.moratoriumUntil ? (
        <Text style={styles.mora}>{t("cia.emi.moratorium")} {shortDate(emi.moratoriumUntil)}</Text>
      ) : null}

      {/* ledger / schedule rows */}
      {hasLedger ? (
        emi.ledger.map((r) => <LedgerRow key={r.installmentNo} r={r} t={t} />)
      ) : emi.schedule.length > 0 ? (
        emi.schedule.map((s) => <ScheduleRow key={s.installmentNo} s={s} t={t} />)
      ) : (
        <View style={styles.empty}><Text style={styles.muted}>{t("cia.emi.no_schedule")}</Text></View>
      )}

      {/* consent CTA */}
      <TouchableOpacity
        style={[styles.consent, initiate && styles.consentManage]}
        onPress={() => router.push({ pathname: "/cia-emi-consent", params: uuid ? { app: uuid } : {} } as any)}
      >
        <Text style={[styles.consentTxt, initiate && styles.consentManageTxt]}>
          {initiate ? t("cia.emi.manage_consent") : t("cia.emi.setup_consent")} →
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.claimLink} onPress={() => router.push({ pathname: "/cia-claim", params: uuid ? { app: uuid } : {} } as any)}>
        <Text style={styles.claimTxt}>🛡 {t("nav.cia_claim")} →</Text>
      </TouchableOpacity>

      {closed ? (
        <TouchableOpacity style={styles.noDues} onPress={async () => {
          const c = uuid ? await getNoDues(uuid) : null;
          if (c) Alert.alert(c.certificateNo || t("cia.emi.no_dues"), `${c.statement}\n${t("cia.emi.loan_ac")} ${c.loanAccount || ""}\n${t("cia.emi.outstanding")}: ${formatRupees(0)}`);
          else Alert.alert(t("cia.load_error"));
        }}>
          <Text style={styles.noDuesTxt}>✅ {t("cia.emi.no_dues")}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function LedgerRow({ r, t }: { r: CiaEmiLedgerRow; t: (k: string) => string }) {
  const chip = CHIP[r.status] || CHIP.DUE;
  const detail =
    r.status === "PAID" ? `${t("cia.emi.deducted")} ${formatRupees(r.amountDeducted)}`
    : r.status === "PARTIAL" ? `${t("cia.emi.deducted")} ${formatRupees(r.amountDeducted)} · ${t("cia.emi.pending")} ${formatRupees(r.pending)}`
    : (r.status === "OVERDUE" || r.status === "DEFAULT") ? `${t("cia.emi.nothing")} · ${formatRupees(r.pending)} ${t("cia.emi.overdue_amt")}`
    : `${t("cia.emi.due")} ${formatRupees(r.emiDue)}`;
  return (
    <View style={styles.row}>
      <Text style={styles.rowNo}>{t("cia.emi.inst")} {r.installmentNo}</Text>
      <Text style={styles.rowDetail} numberOfLines={1}>{detail}</Text>
      <View style={[styles.chip, styles[chip.style as keyof typeof styles] as any]}><Text style={styles.chipTxt}>{t(chip.key)}</Text></View>
    </View>
  );
}

function ScheduleRow({ s, t }: { s: CiaEmiInstallment; t: (k: string) => string }) {
  const chip = CHIP[s.status] || CHIP.SCHEDULED;
  return (
    <View style={styles.row}>
      <Text style={styles.rowNo}>{t("cia.emi.inst")} {s.installmentNo}</Text>
      <Text style={styles.rowDetail} numberOfLines={1}>{t("cia.emi.due")} {formatRupees(s.emiDue)}{s.dueDate ? ` · ${shortDate(s.dueDate)}` : ""}</Text>
      <View style={[styles.chip, styles[chip.style as keyof typeof styles] as any]}><Text style={styles.chipTxt}>{t(chip.key)}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 28 },
  muted: { color: "#888", fontSize: 14, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: "#2e7d32", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt: { color: "#fff", fontWeight: "700" },

  asof: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#e6f0f6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  asofTxt: { color: "#0b5c8a", fontSize: 12, fontWeight: "600", flex: 1 },
  asofAc: { color: "#0b5c8a", fontSize: 11.5, fontWeight: "800" },

  mode: { borderRadius: 10, padding: 11, marginBottom: 12, borderWidth: 1 },
  modeOff: { backgroundColor: "#fef3e2", borderColor: "#f3e2c8" },
  modeOn: { backgroundColor: "#e9f8ef", borderColor: "#bfe3cf" },
  modeTxt: { fontSize: 12.5, lineHeight: 18 },
  modeTxtOff: { color: "#b45309" },
  modeTxtOn: { color: "#0a5c3a", fontWeight: "600" },

  out: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8e4", padding: 14, marginBottom: 12 },
  outV: { fontSize: 22, fontWeight: "800", color: "#0a5c3a" },
  outL: { fontSize: 12, color: "#6b7c74" },
  nextV: { fontSize: 15, fontWeight: "800", color: "#14201b", marginTop: 2 },
  mora: { fontSize: 12, color: "#b45309", backgroundColor: "#fef3e2", borderRadius: 8, padding: 8, marginBottom: 10 },

  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 11, borderWidth: 1, borderColor: "#eee", padding: 11, marginBottom: 7 },
  rowNo: { width: 78, fontSize: 13, fontWeight: "800", color: "#14201b" },
  rowDetail: { flex: 1, fontSize: 12.5, color: "#6b7c74" },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  chipTxt: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  cPaid: { backgroundColor: "#e8f5ee" },
  cPart: { backgroundColor: "#fef3e2" },
  cOver: { backgroundColor: "#fdeeec" },
  cDue: { backgroundColor: "#e6f0f6" },

  empty: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#eee", padding: 18 },

  consent: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 12 },
  consentManage: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfe0d6" },
  consentTxt: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  consentManageTxt: { color: "#1b5e20" },
  noDues: { alignItems: "center", padding: 14, marginTop: 4 },
  noDuesTxt: { color: "#0a5c3a", fontSize: 14, fontWeight: "800" },
  claimLink: { alignItems: "center", padding: 12, marginTop: 8 },
  claimTxt: { color: "#0b5c8a", fontSize: 13.5, fontWeight: "800" },
});
