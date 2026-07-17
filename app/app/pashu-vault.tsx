/**
 * Pashu Suraksha — policy vault. The issued cover delivered to the FARMER
 * (never parked with the VO — convention #12): cover summary, insured animals,
 * the 2 NLM photos, premium trail, waiting-period status, and the policy
 * document. Read from GET /kavach/policies/:policyUuid.
 */
import { useState, useCallback } from "react";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

const PREMIUM_LABEL_KEY: Record<string, string> = {
  farmer_debit: "pashu.vault.pl.farmer_debit", subsidy_central: "pashu.vault.pl.subsidy_central",
  subsidy_state: "pashu.vault.pl.subsidy_state", financed_kcc: "pashu.vault.pl.financed_kcc", refund: "pashu.vault.pl.refund",
};

export default function PashuVault() {
  const router = useRouter();
  const { t } = useI18n();
  const { policyUuid } = useLocalSearchParams<{ policyUuid?: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!policyUuid) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await apiGet(`/kavach/policies/${policyUuid}`);
      if (res.success) setData(res.data);
    } catch (e) {}
    setLoading(false);
  }, [policyUuid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (!data?.policy) return <View style={styles.centerPad}><Text style={styles.muted}>{t("pashu.vault.not_found")}</Text></View>;

  const p = data.policy;
  const assets = data.assets || [];
  const ledger = data.premiumLedger || [];
  const now = new Date();
  const waitingUntil = p.waiting_until ? new Date(p.waiting_until) : null;
  const inWaiting = waitingUntil ? waitingUntil > now : false;

  const openDoc = () => {
    if (p.policy_doc_url) Alert.alert(t("pashu.vault.doc_title"), t("pashu.vault.doc_opening"));
    else Alert.alert(t("pashu.vault.not_ready"), t("pashu.vault.doc_pending"));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <View style={styles.rowB}>
          <Text style={styles.cardTitle}>{t("pashu.vault.sum_insured")}</Text>
          <Text style={[styles.badge, p.status !== "active" && styles.badgeMuted]}>{p.status}</Text>
        </View>
        <Text style={styles.si}>{formatRupees(Number(p.sum_insured))}</Text>
        <Row label={t("pashu.vault.you_pay")} value={formatRupees(Number(p.premium_farmer))} />
        <Row label={t("pashu.vault.total_premium")} value={formatRupees(Number(p.premium_total))} />
        <Row label={t("pashu.vault.cover")} value={`${p.start_date || "—"} → ${p.end_date || "—"}`} />
        {p.policy_number ? <Row label={t("pashu.vault.policy_no")} value={p.policy_number} /> : null}
        {p.insurer_name ? <Row label={t("pashu.vault.insurer")} value={p.insurer_name} /> : null}
      </View>

      {inWaiting ? (
        <View style={[styles.card, styles.warn]}>
          <Text style={styles.warnText}>{t("pashu.vault.waiting_pre")} {p.waiting_until?.slice(0, 10)}. {t("pashu.vault.waiting_post")}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.vault.insured_animals")}</Text>
        {assets.length === 0 ? <Text style={styles.muted}>{t("pashu.vault.no_animals_linked")}</Text> : assets.map((a: any) => (
          <View key={a.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{a.tag_uid ? `UID ${a.tag_uid}` : t("pashu.animal_word")}</Text>
              <Text style={styles.muted}>{t("pashu.vault.valued")} {formatRupees(Number(a.valuation || 0))}</Text>
            </View>
            <View style={styles.photoRow}>
              <Text style={[styles.photoChip, !a.enrol_photo_owner_url && styles.photoMissing]}>{t("pashu.vault.photo_owner")}</Text>
              <Text style={[styles.photoChip, !a.enrol_photo_tag_url && styles.photoMissing]}>{t("pashu.vault.photo_tag")}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.vault.premium_trail")}</Text>
        {ledger.length === 0 ? <Text style={styles.muted}>{t("pashu.vault.no_entries")}</Text> : ledger.map((e: any) => (
          <View key={e.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{PREMIUM_LABEL_KEY[e.entry_type] ? t(PREMIUM_LABEL_KEY[e.entry_type]) : e.entry_type}</Text>
              <Text style={styles.muted}>{e.reference || (e.occurred_at ? String(e.occurred_at).slice(0, 10) : "—")}</Text>
            </View>
            <Text style={styles.rowVal}>{formatRupees(Number(e.amount))}</Text>
            <Text style={[styles.statusDot, e.status === "confirmed" ? styles.ok : e.status === "failed" ? styles.bad : styles.pend]}>
              {e.status === "confirmed" ? "✓" : e.status === "failed" ? "✕" : "…"}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.btn} onPress={openDoc}>
        <Text style={styles.btnText}>{t("pashu.vault.view_doc")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btnGhost} onPress={() => router.push("/pashu-claim")}>
        <Text style={styles.btnGhostText}>{t("pashu.vault.file_claim")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btnGhost} onPress={() => router.push("/pashu-renew")}>
        <Text style={styles.btnGhostText}>{t("pashu.vault.renew")}</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>{t("pashu.vault.footer")}</Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.kv}><Text style={styles.kvLabel}>{label}</Text><Text style={styles.kvVal}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  centerPad: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 32 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  rowB: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  si: { fontSize: 30, fontWeight: "800", color: "#1b5e20", marginBottom: 8 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  kvLabel: { fontSize: 14, color: "#444" },
  kvVal: { fontSize: 14, color: "#222", fontWeight: "600", fontVariant: ["tabular-nums"] },
  warn: { backgroundColor: "#fff7e6", borderColor: "#ffe0a3" },
  warnText: { color: "#9a5b00", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#333", fontWeight: "600" },
  rowVal: { fontSize: 14, color: "#222", fontWeight: "700", fontVariant: ["tabular-nums"] },
  muted: { color: "#888", fontSize: 13, marginTop: 2 },
  photoRow: { flexDirection: "row", gap: 6 },
  photoChip: { fontSize: 11, color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontWeight: "600", overflow: "hidden" },
  photoMissing: { color: "#b26a00", backgroundColor: "#fff2df" },
  statusDot: { width: 20, textAlign: "center", fontWeight: "800", fontSize: 14 },
  ok: { color: "#2e7d32" }, bad: { color: "#c62828" }, pend: { color: "#b26a00" },
  badge: { fontSize: 11, fontWeight: "800", color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  badgeMuted: { color: "#888", backgroundColor: "#eee" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnGhost: { backgroundColor: "#e8f5e9", borderRadius: 12, padding: 13, alignItems: "center", marginBottom: 10 },
  btnGhostText: { color: "#1b5e20", fontSize: 15, fontWeight: "700" },
  footer: { fontSize: 12, color: "#888", lineHeight: 18, marginBottom: 20, marginTop: 4 },
});
