/**
 * Pashu Suraksha renewals — one-tap renew clones your policy + tag + photos (zero
 * re-documentation) and opt-in auto-renew. Renewal is opt-in only. Wired to
 * /api/v1/kavach/renewals. Journeys carry policy_id; joined to policies/me for
 * the policy_uuid the renew endpoint needs.
 */
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

export default function PashuRenew() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [due, po] = await Promise.all([apiGet("/kavach/renewals/due"), apiGet("/kavach/policies/me")]);
      const policies: any[] = po.success ? (po.data?.policies || []) : [];
      const byId = new Map(policies.map((p) => [p.id, p]));
      const journeys: any[] = due.success ? (due.data || []) : [];
      setRows(journeys.map((j) => ({ ...j, policy: byId.get(j.policy_id) })));
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renew = async (policyUuid: string, key: string) => {
    setBusy(key);
    try {
      const res = await apiPost(`/kavach/renewals/${policyUuid}/renew`, {});
      if (res.success) { Alert.alert(t("pashu.renew.renewed"), t("pashu.renew.renewed_msg")); load(); }
      else Alert.alert(t("pashu.renew.could_not_renew"), res.message || t("common.try_again"));
    } catch (e) { Alert.alert(t("common.error"), t("pashu.cannot_connect")); }
    finally { setBusy(null); }
  };

  const optIn = async (journeyUuid: string, key: string) => {
    setBusy(key);
    try {
      const res = await apiPost(`/kavach/renewals/${journeyUuid}/opt-in`, {});
      if (res.success) { Alert.alert(t("pashu.renew.auto_on_title"), t("pashu.renew.auto_on_msg")); load(); }
      else Alert.alert(t("pashu.renew.could_not_optin"), res.message || t("common.try_again"));
    } catch (e) { Alert.alert(t("common.error"), t("pashu.cannot_connect")); }
    finally { setBusy(null); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  if (rows.length === 0) {
    return <View style={styles.center}><Text style={styles.muted}>{t("pashu.renew.none_due")}</Text></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      {rows.map((r) => (
        <View key={r.journey_uuid} style={styles.card}>
          <View style={styles.rowB}>
            <Text style={styles.title}>{t("pashu.renew.due_title")}</Text>
            <Text style={styles.badge}>{r.status}</Text>
          </View>
          <Text style={styles.muted}>{t("pashu.renew.due_word")} {r.due_date}{r.policy ? ` · ${t("pashu.si")} ${formatRupees(Number(r.policy.sum_insured))}` : ""}</Text>
          <Text style={styles.note}>{t("pashu.renew.note")}</Text>
          <TouchableOpacity
            style={[styles.btn, (!r.policy || busy) && styles.btnDisabled]}
            disabled={!r.policy || !!busy}
            onPress={() => renew(r.policy.policy_uuid, r.journey_uuid)}
          >
            {busy === r.journey_uuid ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t("pashu.renew.renew_now")}</Text>}
          </TouchableOpacity>
          {!r.auto_renew_opt_in ? (
            <TouchableOpacity style={styles.link} disabled={!!busy} onPress={() => optIn(r.journey_uuid, r.journey_uuid + "-opt")}>
              <Text style={styles.linkText}>{t("pashu.renew.auto_optin")}</Text>
            </TouchableOpacity>
          ) : <Text style={styles.optedIn}>{t("pashu.renew.auto_is_on")}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  rowB: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#1b5e20" },
  badge: { fontSize: 11, fontWeight: "800", color: "#b4530a", backgroundColor: "#fff8ec", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  muted: { color: "#888", fontSize: 13, marginTop: 4 },
  note: { color: "#555", fontSize: 13, marginTop: 8, lineHeight: 18 },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 13, alignItems: "center", marginTop: 12 },
  btnDisabled: { backgroundColor: "#b8c6bf" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  link: { padding: 10, alignItems: "center" },
  linkText: { color: "#2e7d32", fontSize: 14, fontWeight: "600" },
  optedIn: { color: "#1b5e20", fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 10 },
});
