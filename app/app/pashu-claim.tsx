/**
 * Pashu Suraksha claim — report a death, then the NLM 4-document checklist on a
 * visible 15-day clock. Decisions are never automated; every step is on a
 * tamper-evident hash chain. Wired to /api/v1/claims.
 */
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

const CLAIM_FLOW = ["INTIMATED", "SURVEY_DONE", "PM_DONE", "DOCS_SUBMITTED", "UNDER_REVIEW", "SETTLED"];
const DOC_LABEL_KEY: Record<string, string> = {
  DEATH_INTIMATION: "pashu.claim.doc.death", POSTMORTEM_REPORT: "pashu.claim.doc.pm",
  EAR_TAG_PHOTO: "pashu.claim.doc.tag_photo", CLAIM_FORM: "pashu.claim.doc.form",
};

function mockHash(seed: string): string {
  const s = seed + Math.random();
  let h = "";
  for (let i = 0; i < 64; i++) h += ((s.charCodeAt(i % s.length) + i * 7) % 16).toString(16);
  return h;
}

export default function PashuClaim() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [claims, setClaims] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null); // {claim, checklist, ...}
  const [policyUuid, setPolicyUuid] = useState<string | null>(null);
  const [peril, setPeril] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cl, po] = await Promise.all([apiGet("/claims/me"), apiGet("/kavach/policies/me")]);
      if (cl.success) setClaims(cl.data || []);
      if (po.success) setPolicies((po.data?.policies || []).filter((p: any) => p.status === "active"));
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); setSelected(null); }, [load]));

  const openClaim = async (uuid: string) => {
    const res = await apiGet(`/claims/${uuid}`);
    if (res.success) setSelected(res.data);
  };

  const intimate = async () => {
    if (!policyUuid) { Alert.alert(t("pashu.claim.pick_policy"), t("pashu.claim.which_died")); return; }
    setBusy(true);
    try {
      const res = await apiPost("/claims", { policyUuid, peril: peril.trim() || "disease" });
      if (res.success) { setPeril(""); await load(); await openClaim(res.data.claimUuid); }
      else Alert.alert(t("pashu.claim.could_not_file"), res.message || t("common.try_again"));
    } catch (e) { Alert.alert(t("common.error"), t("pashu.cannot_connect")); }
    finally { setBusy(false); }
  };

  const addDoc = async (kind: string) => {
    setBusy(true);
    try {
      const res = await apiPost(`/claims/${selected.claim.claim_uuid}/evidence`, {
        kind, objectKey: `app://claim/${kind}`, contentHash: mockHash(kind + selected.claim.claim_uuid),
      });
      if (res.success) await openClaim(selected.claim.claim_uuid);
      else Alert.alert(t("pashu.claim.could_not_attach"), res.message || t("common.try_again"));
    } catch (e) { Alert.alert(t("common.error"), t("pashu.cannot_connect")); }
    finally { setBusy(false); }
  };

  const submitDocs = async () => {
    setBusy(true);
    try {
      const res = await apiPost(`/claims/${selected.claim.claim_uuid}/submit-docs`, {});
      if (res.success) { Alert.alert(t("pashu.claim.submitted"), t("pashu.claim.submitted_msg")); await load(); await openClaim(selected.claim.claim_uuid); }
      else Alert.alert(t("pashu.claim.not_submitted"), res.message || t("pashu.claim.complete_four"));
    } catch (e) { Alert.alert(t("common.error"), t("pashu.cannot_connect")); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  // ── Claim detail ──
  if (selected) {
    const c = selected.claim;
    const idx = CLAIM_FLOW.indexOf(c.status);
    const list = selected.checklist;
    return (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
        <View style={styles.banner}><Text style={styles.bannerText}>{t("pashu.claim.banner")}</Text></View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("pashu.claim.status")}</Text>
          {CLAIM_FLOW.map((s, i) => (
            <View key={s} style={styles.step}>
              <View style={[styles.dot, i <= idx && styles.dotDone, i === idx && styles.dotNow]} />
              <Text style={[styles.stepLbl, i === idx && styles.stepNow]}>{s.replace(/_/g, " ").toLowerCase()}</Text>
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("pashu.claim.checklist")}</Text>
          {list?.required?.map((kind: string) => {
            const have = list.present.includes(kind);
            return (
              <View key={kind} style={styles.row}>
                <Text style={styles.docLabel}>{have ? "✅ " : "⬜ "}{DOC_LABEL_KEY[kind] ? t(DOC_LABEL_KEY[kind]) : kind}</Text>
                {!have && c.status !== "SETTLED" ? (
                  <TouchableOpacity style={styles.addBtn} disabled={busy} onPress={() => addDoc(kind)}><Text style={styles.addBtnText}>{t("pashu.claim.attach")}</Text></TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("pashu.claim.settlement_clock")}</Text>
          <Text style={styles.muted}>{t("pashu.claim.settlement_note")}</Text>
          {c.penal_interest_accrued > 0 ? <Text style={styles.penal}>{t("pashu.claim.penal_interest")}: {formatRupees(Number(c.penal_interest_accrued))}</Text> : null}
        </View>
        {c.status === "PM_DONE" && list?.complete ? (
          <TouchableOpacity style={styles.btn} disabled={busy} onPress={submitDocs}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t("pashu.claim.submit_docs")}</Text>}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.link} onPress={() => setSelected(null)}><Text style={styles.linkText}>{t("pashu.claim.back_to_claims")}</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Claims list + report a death ──
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.claim.report_death")}</Text>
        {policies.length === 0 ? <Text style={styles.muted}>{t("pashu.claim.no_active_policy")}</Text> : (
          <>
            <View style={styles.chipRow}>
              {policies.map((p) => (
                <TouchableOpacity key={p.policy_uuid} style={[styles.chip, policyUuid === p.policy_uuid && styles.chipSel]} onPress={() => setPolicyUuid(p.policy_uuid)}>
                  <Text style={[styles.chipText, policyUuid === p.policy_uuid && styles.chipTextSel]}>{t("pashu.si")} {formatRupees(Number(p.sum_insured))}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder={t("pashu.claim.cause_placeholder")} value={peril} onChangeText={setPeril} />
            <TouchableOpacity style={styles.btn} disabled={busy} onPress={intimate}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t("pashu.claim.file_claim")}</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.claim.my_claims")}</Text>
        {claims.length === 0 ? <Text style={styles.muted}>{t("pashu.claim.no_claims")}</Text> : claims.map((c) => (
          <TouchableOpacity key={c.claim_uuid} style={styles.row} onPress={() => openClaim(c.claim_uuid)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.docLabel}>{formatRupees(Number(c.sum_claimed))} · {c.peril || "—"}</Text>
              <Text style={styles.muted}>{new Date(c.intimated_at).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.badge}>{c.status}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  banner: { backgroundColor: "#fff8ec", borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#f0dcc0" },
  bannerText: { color: "#b4530a", fontSize: 12 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  step: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  dot: { width: 12, height: 12, borderRadius: 999, backgroundColor: "#ddd" },
  dotDone: { backgroundColor: "#2e7d32" }, dotNow: { backgroundColor: "#b4530a" },
  stepLbl: { fontSize: 13, color: "#888", textTransform: "capitalize" },
  stepNow: { color: "#1b5e20", fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  docLabel: { fontSize: 14, color: "#333", fontWeight: "600" },
  addBtn: { backgroundColor: "#e8f5e9", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: "#1b5e20", fontWeight: "700", fontSize: 13 },
  muted: { color: "#888", fontSize: 13, lineHeight: 18 },
  penal: { color: "#1b5e20", fontWeight: "700", fontSize: 14, marginTop: 8 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  chip: { borderRadius: 10, borderWidth: 1, borderColor: "#ddd", paddingVertical: 8, paddingHorizontal: 12 },
  chipSel: { backgroundColor: "#e8f5e9", borderColor: "#2e7d32" },
  chipText: { fontSize: 13, color: "#555" }, chipTextSel: { color: "#1b5e20", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 10, backgroundColor: "#fafafa" },
  badge: { fontSize: 11, fontWeight: "800", color: "#0b5c8a", backgroundColor: "#e6f0f6", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: { padding: 10, alignItems: "center", marginBottom: 16 },
  linkText: { color: "#2e7d32", fontSize: 14, fontWeight: "600" },
});
