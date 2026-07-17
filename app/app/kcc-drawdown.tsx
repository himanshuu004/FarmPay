/**
 * KCC LT drawdown (¶19(2)) — draw against the investment sub-limit for an animal,
 * shed, or equipment. On disbursement the asset enters your register + you get an
 * insurance nudge. Wired to /api/v1/kcc/facility/:uuid/drawdowns.
 */
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

const ITEMS: { value: string; labelKey: string }[] = [
  { value: "ANIMAL", labelKey: "kcc.item.animal" },
  { value: "SHED", labelKey: "kcc.item.shed" },
  { value: "EQUIPMENT", labelKey: "kcc.item.equipment" },
];

export default function KccDrawdown() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uuid, setUuid] = useState<string | null>(null);
  const [headroom, setHeadroom] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [item, setItem] = useState("ANIMAL");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fac = await apiGet("/kcc/facility");
      if (!fac.success || !fac.data?.hasFacility) { setLoading(false); return; }
      const fu = fac.data.facilityUuid;
      setUuid(fu);
      const dd = await apiGet(`/kcc/facility/${fu}/drawdowns`);
      if (dd.success) { setHeadroom(dd.data.headroom); setRequests(dd.data.requests || []); }
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!desc.trim() || !(amt > 0)) { Alert.alert(t("kcc.fill_it_in"), t("kcc.fill_desc_amount")); return; }
    setBusy(true);
    try {
      const create = await apiPost(`/kcc/facility/${uuid}/drawdowns`, { item, description: desc.trim(), amount: amt });
      if (!create.success) { Alert.alert(t("kcc.could_not_raise"), create.message || t("common.try_again")); return; }
      const sub = await apiPost(`/kcc/drawdowns/${create.data.requestUuid}/submit`, {});
      if (sub.success) { Alert.alert(t("kcc.submitted_title"), t("kcc.sent_to_bank")); setDesc(""); setAmount(""); load(); }
      else Alert.alert(t("kcc.not_submitted"), sub.message || t("common.try_again"));
    } catch (e) { Alert.alert(t("common.error"), t("kcc.cannot_connect")); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (!uuid) return <View style={styles.center}><Text style={styles.muted}>{t("kcc.apply_first")}</Text></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.investment_headroom")}</Text>
        <Text style={styles.kpi}>{formatRupees(headroom?.available ?? 0)}</Text>
        <Text style={styles.muted}>{t("kcc.of_word")} {formatRupees(headroom?.ceiling ?? 0)} · {t("kcc.committed_word")} {formatRupees(headroom?.committed ?? 0)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.new_drawdown")}</Text>
        <View style={styles.chipRow}>
          {ITEMS.map((it) => (
            <TouchableOpacity key={it.value} style={[styles.chip, item === it.value && styles.chipSel]} onPress={() => setItem(it.value)}>
              <Text style={[styles.chipText, item === it.value && styles.chipTextSel]}>{t(it.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} placeholder={t("kcc.desc_placeholder")} value={desc} onChangeText={setDesc} />
        <TextInput style={styles.input} placeholder={t("kcc.amount_placeholder")} keyboardType="number-pad" value={amount} onChangeText={setAmount} />
        <Text style={styles.note}>{t("kcc.drawdown_note")}</Text>
        <TouchableOpacity style={styles.btn} disabled={busy} onPress={submit}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t("kcc.submit_drawdown")}</Text>}
        </TouchableOpacity>
      </View>

      {requests.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("kcc.your_drawdowns")}</Text>
          {requests.map((r) => (
            <View key={r.request_uuid} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{r.item} · {r.description}</Text>
                <Text style={styles.muted}>{formatRupees(Number(r.amount))}</Text>
              </View>
              <Text style={styles.badge}>{r.status}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  kpi: { fontSize: 26, fontWeight: "800", color: "#1b5e20" },
  muted: { color: "#888", fontSize: 13, marginTop: 2 },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  chip: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#ddd", paddingVertical: 10, alignItems: "center" },
  chipSel: { backgroundColor: "#e8f5e9", borderColor: "#2e7d32" },
  chipText: { fontSize: 13, color: "#555" },
  chipTextSel: { color: "#1b5e20", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 10, backgroundColor: "#fafafa" },
  note: { fontSize: 12, color: "#888", marginBottom: 12, lineHeight: 17 },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#333", fontWeight: "600" },
  badge: { fontSize: 11, fontWeight: "800", color: "#0b5c8a", backgroundColor: "#e6f0f6", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
});
