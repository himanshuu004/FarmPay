/**
 * KCC Dairy application form — the farmer-authored step of the society-mediated
 * workflow. The farmer (with the DCS Secretary / Bank Mitra's help) fills this;
 * on submit it becomes a DRAFT facility that the Milk Union then CERTIFIES
 * (membership, cattle, milk supply, DBT) before the bank sanctions.
 *
 * Captured here (per the KCC Dairy logical flow):
 *   • animals — LIVE from the register (never typed)   • KYC checklist (PAN/Aadhaar/land/photo)
 *   • DBT savings account (DCCB/cooperative bank)       • milk-union tie-up request (→ ₹3 lakh)
 *   • repayment support (tripartite + no-cost service → 3% interest subvention)
 * The society/bank VERIFY these; the app only captures them.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { BigInput } from "../components/FormKit";

const KYC_DOCS = [
  { key: "aadhaar", labelKey: "kcc.kyc.aadhaar" },
  { key: "pan", labelKey: "kcc.kyc.pan" },
  { key: "land", labelKey: "kcc.kyc.land" },
  { key: "photo", labelKey: "kcc.kyc.photo" },
];

export default function KccApply() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ animalUuids?: string }>();
  // Animals chosen in the calculator (the KCC is raised against this subset).
  let chosenAnimalUuids: string[] = [];
  try { if (params.animalUuids) chosenAnimalUuids = JSON.parse(params.animalUuids); } catch (e) {}
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [member, setMember] = useState<boolean | null>(null);
  const [animals, setAnimals] = useState(0);
  const [preview, setPreview] = useState<any>(null);

  const [kyc, setKyc] = useState<Record<string, boolean>>({ aadhaar: false, pan: false, land: false, photo: false });
  const [bankAccount, setBankAccount] = useState("");
  const [tieup, setTieup] = useState(true);
  const [tripartite, setTripartite] = useState(false);
  const [noCost, setNoCost] = useState(false);
  const [consent, setConsent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pb, an, calc] = await Promise.all([
        apiGet("/coop/passbook"),
        apiGet("/kavach/assets/me"),
        apiPost("/kcc/calculate", { activities: [{ code: "DAIRY", ...(chosenAnimalUuids.length ? { animalUuids: chosenAnimalUuids } : {}) }] }).catch(() => ({ success: false })),
      ]);
      setMember(pb.success ? pb.data?.isMember !== false : false);
      if (an.success) setAnimals((an.data || []).length);
      if (calc.success) setPreview(calc.data);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const kycCount = Object.values(kyc).filter(Boolean).length;

  const submit = async () => {
    if (!consent) { Alert.alert(t("kcc.consent_needed"), t("kcc.consent_msg")); return; }
    if (!bankAccount.trim() || bankAccount.trim().length < 6) { Alert.alert(t("kcc.bank_account_title"), t("kcc.bank_account_msg")); return; }
    if (kycCount < 4) { Alert.alert(t("kcc.kyc_docs_title"), t("kcc.kyc_docs_msg")); return; }
    setBusy(true);
    try {
      const res = await apiPost("/kcc/apply", {
        activities: [{ code: "DAIRY", ...(chosenAnimalUuids.length ? { animalUuids: chosenAnimalUuids } : {}) }],
        bankAccountRef: bankAccount.trim(),
        tieupRequested: tieup,
        kyc,
        repaymentConsent: { tripartite, noCostService: noCost },
      });
      if (res.success) {
        Alert.alert(t("kcc.app_saved_title"), t("kcc.app_saved_msg"), [
          { text: t("common.ok"), onPress: () => router.replace("/kcc") },
        ]);
      } else {
        Alert.alert(t("kcc.could_not_apply"), res.message?.includes("society") ? t("kcc.join_society_msg") : (res.message || t("common.try_again")));
      }
    } catch (e) { Alert.alert(t("common.error"), t("kcc.cannot_connect_check")); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  if (member === false) {
    return (
      <View style={styles.centerPad}>
        <Text style={styles.emoji}>🤝</Text>
        <Text style={styles.h1}>{t("kcc.join_first_title")}</Text>
        <Text style={styles.muted}>{t("kcc.join_first_msg")}</Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={() => router.push("/society")}>
          <Text style={styles.btnText}>{t("kcc.go_to_society")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.lead}>{t("kcc.apply_lead")}</Text>

      {/* Your dairy — live from the register */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.your_dairy")}</Text>
        <Row label={chosenAnimalUuids.length ? t("kcc.animals_in_kcc") : t("kcc.animals_in_register")} value={chosenAnimalUuids.length ? `${chosenAnimalUuids.length} ${t("kcc.selected_word")}` : `${animals}`} />
        <Row label={t("kcc.society_member")} value={t("kcc.linked")} />
        {preview ? <Row label={t("kcc.estimated_limit_sof")} value={formatRupees(preview.cmpl)} strong /> : null}
        <Text style={styles.hintSm}>{t("kcc.limit_fixed_hint")}</Text>
      </View>

      {/* KYC checklist */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.kyc_documents")} ({kycCount}/4)</Text>
        <Text style={styles.hintSm}>{t("kcc.kyc_confirm_hint")}</Text>
        {KYC_DOCS.map((d) => (
          <TouchableOpacity key={d.key} style={styles.check} onPress={() => setKyc({ ...kyc, [d.key]: !kyc[d.key] })}>
            <View style={[styles.box, kyc[d.key] && styles.boxOn]}>{kyc[d.key] ? <Text style={styles.boxTick}>✓</Text> : null}</View>
            <Text style={styles.checkLabel}>{t(d.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* DBT bank account */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.bank_for_dbt")}</Text>
        <BigInput value={bankAccount} onChangeText={setBankAccount} placeholder={t("kcc.bank_placeholder")} numeric />
        <Text style={styles.hintSm}>{t("kcc.bank_hint")}</Text>
      </View>

      {/* Tie-up for ₹3 lakh */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.milk_union_tieup_title")}</Text>
        <TouchableOpacity style={styles.check} onPress={() => setTieup(!tieup)}>
          <View style={[styles.box, tieup && styles.boxOn]}>{tieup ? <Text style={styles.boxTick}>✓</Text> : null}</View>
          <Text style={styles.checkLabel}>{t("kcc.tieup_check")}</Text>
        </TouchableOpacity>
        <Text style={styles.hintGood}>{t("kcc.tieup_hint")}</Text>
      </View>

      {/* Repayment support */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.repay_support")}</Text>
        <TouchableOpacity style={styles.check} onPress={() => setTripartite(!tripartite)}>
          <View style={[styles.box, tripartite && styles.boxOn]}>{tripartite ? <Text style={styles.boxTick}>✓</Text> : null}</View>
          <Text style={styles.checkLabel}>{t("kcc.tripartite_check")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.check} onPress={() => setNoCost(!noCost)}>
          <View style={[styles.box, noCost && styles.boxOn]}>{noCost ? <Text style={styles.boxTick}>✓</Text> : null}</View>
          <Text style={styles.checkLabel}>{t("kcc.nocost_check")}</Text>
        </TouchableOpacity>
        <Text style={styles.hintGood}>{t("kcc.repay_hint")}</Text>
      </View>

      {/* Declaration */}
      <TouchableOpacity style={styles.check} onPress={() => setConsent(!consent)}>
        <View style={[styles.box, consent && styles.boxOn]}>{consent ? <Text style={styles.boxTick}>✓</Text> : null}</View>
        <Text style={styles.checkLabel}>{t("kcc.declaration")}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, (busy || !consent) && styles.btnDim]} disabled={busy || !consent} onPress={submit}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t("kcc.save_application")}</Text>}
      </TouchableOpacity>
      <Text style={styles.footer}>{t("kcc.apply_footer")}</Text>
    </ScrollView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={[styles.rowVal, strong && styles.rowStrong]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  centerPad: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 32 },
  emoji: { fontSize: 44, marginBottom: 8 },
  h1: { fontSize: 22, fontWeight: "800", color: "#1b5e20", marginBottom: 8 },
  lead: { fontSize: 13, color: "#777", marginBottom: 14, lineHeight: 19 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 13, color: "#555", fontWeight: "800", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#444", flex: 1 },
  rowVal: { fontSize: 14, color: "#222", fontWeight: "700" },
  rowStrong: { color: "#1b5e20", fontSize: 16 },
  hintSm: { fontSize: 12, color: "#999", marginTop: 6, lineHeight: 17 },
  hintGood: { fontSize: 12, color: "#1b5e20", marginTop: 8, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: "#fafafa" },
  check: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#bbb", alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  boxTick: { color: "#fff", fontSize: 14, fontWeight: "800" },
  checkLabel: { flex: 1, fontSize: 13, color: "#333", lineHeight: 18 },
  hi: { color: "#888" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 6 },
  btnDim: { backgroundColor: "#b8c6bf" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  muted: { color: "#888", fontSize: 13, textAlign: "center", lineHeight: 19 },
  footer: { fontSize: 12, color: "#888", lineHeight: 18, marginTop: 12, textAlign: "center" },
});
