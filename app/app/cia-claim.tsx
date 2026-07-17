/**
 * CIA — cattle insurance claim (report + track). On death/loss the farmer files a
 * claim against the cattle policy, reusing the platform CLAIMS engine: only 4
 * documents, a 15-day settlement clock from docs-complete, and 12% p.a. penal
 * interest (farmer-visible) if the insurer breaches. No auto-denial — a human decides.
 *
 * Wired to GET /applications/:uuid/claim (status or {claim:null}) and POST .../claim.
 * Non-ok read = not insured yet. Settled prototype: farmer-claim.html.
 */
import { useState, useCallback } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useContentMax } from "../lib/responsive";
import { FieldLabel, BigInput } from "../components/FormKit";
import { getClaim, reportClaim, myApplications, CiaClaimStatus, CiaClaimDoc } from "../lib/ciaApi";

const STAGE_KEYS = ["cia.claim.s_intimated", "cia.claim.s_survey", "cia.claim.s_pm", "cia.claim.s_docs", "cia.claim.s_review", "cia.claim.s_settled"];
// Map a CLAIMS status to a stage index.
const STAGE_OF: Record<string, number> = {
  INTIMATED: 0, SURVEY_DONE: 1, PM_DONE: 2, DOCS_SUBMITTED: 3, UNDER_REVIEW: 4, SETTLED: 5, REJECTED: 4, ESCALATED: 4,
};

function daysBetween(iso?: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  return Math.round((then - Date.now()) / 86400000);
}

export default function CiaClaim() {
  const { t } = useI18n();
  const cmax = useContentMax();
  const { app } = useLocalSearchParams<{ app?: string }>();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [uuid, setUuid] = useState<string | null>(null);
  const [data, setData] = useState<CiaClaimStatus | null>(null);
  const [peril, setPeril] = useState("");
  const [sum, setSum] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setUnavailable(false);
    try {
      let id = app || null;
      if (!id) {
        const apps = await myApplications();
        if (!apps.length) { setUnavailable(true); setLoading(false); return; }
        id = apps[0].applicationUuid;
      }
      setUuid(id);
      const r = id ? await getClaim(id) : { ok: false };
      if (r.ok && r.data) setData(r.data);
      else setUnavailable(true);      // no cattle policy yet
    } catch { setUnavailable(true); }
    setLoading(false);
  }, [app]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const file = useCallback(async () => {
    if (!uuid) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const body: { peril?: string; deathDate?: string; sumClaimed?: number } = { deathDate: today };
    if (peril.trim()) body.peril = peril.trim();
    const n = Number(sum.replace(/[^\d]/g, ""));
    if (n > 0) body.sumClaimed = n;
    const r = await reportClaim(uuid, body);
    setBusy(false);
    if (r.ok) { Alert.alert(t("cia.claim.filed")); load(); }
    else Alert.alert(r.message || t("cia.load_error"));
  }, [uuid, peril, sum, t, load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  if (unavailable) {
    return (
      <View style={styles.center}>
        <Text style={styles.art}>🐄</Text>
        <Text style={styles.muted}>{t("cia.claim.unavailable")}</Text>
      </View>
    );
  }

  const hasClaim = !!data?.claimUuid;

  // ── report form (policy exists, no claim yet) ──
  if (!hasClaim) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, cmax]}>
        <Text style={styles.h}>{t("cia.claim.report_title")}</Text>
        <Text style={styles.sub}>{t("cia.claim.report_sub")}</Text>

        <FieldLabel en={t("cia.claim.peril")} />
        <BigInput value={peril} onChangeText={setPeril} placeholder={t("cia.claim.peril_ph")} />
        <View style={{ height: 12 }} />
        <FieldLabel en={t("cia.claim.sum")} />
        <BigInput value={sum} onChangeText={setSum} placeholder="" numeric prefix="₹" />

        <TouchableOpacity style={[styles.file, busy && styles.fileOff]} onPress={file} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.fileTxt}>{t("cia.claim.submit")}</Text>}
        </TouchableOpacity>
        <Text style={styles.noDenial}>ℹ {t("cia.claim.no_denial")}</Text>
      </ScrollView>
    );
  }

  // ── track view (claim exists) ──
  const days = daysBetween(data!.settlementDeadlineAt);
  const settled = data!.status === "SETTLED";
  const breach = !settled && days != null && days < 0;
  const penal = Number(data!.penalInterestAccrued || 0);
  const stage = STAGE_OF[data!.status || "INTIMATED"] ?? 0;
  const docs: CiaClaimDoc[] = data!.docChecklist || [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, cmax]}>
      {/* settlement clock */}
      <View style={[styles.clock, breach && styles.clockBreach]}>
        <Text style={[styles.clockBig, breach && styles.clockBigBreach]}>
          {settled ? t("cia.claim.settled") : breach ? `${Math.abs(days!)} ${t("cia.claim.days_over")}` : days != null ? `${days} ${t("cia.claim.days_left")}` : "—"}
        </Text>
        <Text style={styles.clockL}>{t("cia.claim.clock")}</Text>
      </View>

      {breach && penal > 0 ? (
        <View style={styles.penal}><Text style={styles.penalTxt}>⏱ {t("cia.claim.penal")} {formatRupees(penal)}</Text></View>
      ) : null}

      {settled && data!.settledAmount != null ? (
        <View style={styles.settled}>
          <Text style={styles.settledL}>{t("cia.claim.settled_amt")}</Text>
          <Text style={styles.settledV}>{formatRupees(data!.settledAmount)}</Text>
        </View>
      ) : null}

      {/* 4-doc checklist */}
      <Text style={styles.section}>{t("cia.claim.docs")}</Text>
      {docs.length > 0 ? docs.map((d, i) => {
        const ok = d.present ?? d.uploaded ?? d.complete ?? false;
        return (
          <View key={d.key || i} style={styles.docRow}>
            <View style={[styles.docIc, ok ? styles.docOk : styles.docNo]}><Text style={styles.docIcTxt}>{ok ? "✓" : ""}</Text></View>
            <Text style={styles.docLabel}>{d.label || d.key}</Text>
          </View>
        );
      }) : <Text style={styles.muted}>—</Text>}

      {/* progress */}
      <Text style={[styles.section, { marginTop: 14 }]}>{t("cia.claim.progress")}</Text>
      <View style={styles.tl}>
        {STAGE_KEYS.map((k, i) => {
          const state = i < stage ? "done" : i === stage ? "now" : "future";
          return (
            <View key={k} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <View style={[styles.dot, state === "done" && styles.dotDone, state === "now" && styles.dotNow]} />
                {i < STAGE_KEYS.length - 1 ? <View style={[styles.line, i < stage && styles.lineDone]} /> : null}
              </View>
              <Text style={[styles.tlH, state === "future" && styles.future, state === "now" && styles.tlNow]}>{t(k)}</Text>
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
  art: { fontSize: 46, marginBottom: 8 },
  muted: { color: "#888", fontSize: 14, textAlign: "center" },
  h: { fontSize: 20, fontWeight: "800", color: "#14201b" },
  sub: { fontSize: 13, color: "#6b7c74", marginTop: 6, marginBottom: 16, lineHeight: 19 },

  file: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 18 },
  fileOff: { backgroundColor: "#a9c3b1" },
  fileTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  noDenial: { fontSize: 12, color: "#888", textAlign: "center", marginTop: 12 },

  clock: { backgroundColor: "#e6f0f6", borderWidth: 1, borderColor: "#d4e6f1", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 12 },
  clockBreach: { backgroundColor: "#fdeeec", borderColor: "#f6cfc9" },
  clockBig: { fontSize: 22, fontWeight: "800", color: "#0b5c8a" },
  clockBigBreach: { color: "#b42318" },
  clockL: { fontSize: 12, color: "#6b7c74", marginTop: 2, textAlign: "center" },
  penal: { backgroundColor: "#fef3e2", borderWidth: 1, borderColor: "#f3e2c8", borderRadius: 8, padding: 10, marginBottom: 12 },
  penalTxt: { color: "#b45309", fontSize: 12.5, lineHeight: 18 },
  settled: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#e9f8ef", borderWidth: 1, borderColor: "#bfe3cf", borderRadius: 12, padding: 14, marginBottom: 12 },
  settledL: { fontSize: 13, color: "#0a5c3a", fontWeight: "600" },
  settledV: { fontSize: 18, fontWeight: "800", color: "#0a5c3a" },

  section: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, color: "#888", marginBottom: 8 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eef2f0" },
  docIc: { width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  docOk: { backgroundColor: "#0f7a4d" },
  docNo: { backgroundColor: "#c3ccc7" },
  docIcTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  docLabel: { fontSize: 13.5, color: "#333", flex: 1 },

  tl: { paddingLeft: 2 },
  tlRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  tlRail: { width: 16, alignItems: "center" },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#c3ccc7", marginTop: 2 },
  dotDone: { backgroundColor: "#0f7a4d" },
  dotNow: { backgroundColor: "#fff", borderWidth: 3, borderColor: "#0f7a4d", width: 14, height: 14, borderRadius: 7 },
  line: { flex: 1, width: 2, backgroundColor: "#e2e8e4", marginTop: 2, minHeight: 14 },
  lineDone: { backgroundColor: "#0f7a4d" },
  tlH: { flex: 1, fontSize: 13.5, fontWeight: "700", color: "#14201b", paddingBottom: 14 },
  tlNow: { color: "#0a5c3a" },
  future: { opacity: 0.5 },
});
