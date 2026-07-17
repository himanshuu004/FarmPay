/**
 * Society orders — the ERP-mirrored order timeline. The app authors only the
 * RECEIPT_CONFIRMED transition (on a DISPATCHED order); every approval status
 * arrives from the Aanchal ERP. On receipt, the delivered inputs auto-log as a
 * feed cost. Wired to /api/v1/coop.
 */
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

const FLOW = ["SUBMITTED", "SECRETARY_APPROVED", "SUPERVISOR_APPROVED", "DUSS_PROCESSING", "DISPATCHED", "RECEIPT_CONFIRMED"];
const LABEL_KEY: Record<string, string> = {
  DRAFT: "soc.status.draft", SUBMITTED: "soc.status.submitted", SECRETARY_APPROVED: "soc.status.secretary_approved",
  SUPERVISOR_APPROVED: "soc.status.supervisor_approved", DUSS_PROCESSING: "soc.status.processing",
  DISPATCHED: "soc.status.dispatched", RECEIPT_CONFIRMED: "soc.status.received", REJECTED: "soc.status.rejected",
};

export default function SocietyOrders() {
  const { t } = useI18n();
  const label = (status: string) => (LABEL_KEY[status] ? t(LABEL_KEY[status]) : status);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet("/coop/orders");
      if (res.success) setOrders(res.data || []);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmReceipt = async (uuid: string) => {
    setBusy(uuid);
    try {
      const res = await apiPost(`/coop/orders/${uuid}/receipt`, {});
      if (res.success) { Alert.alert(t("soc.receipt_confirmed_title"), t("soc.receipt_confirmed_msg")); load(); }
      else Alert.alert(t("soc.not_confirmed_title"), res.message || t("common.try_again"));
    } catch (e) { Alert.alert(t("common.error"), t("soc.connect_fail")); }
    finally { setBusy(null); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  if (orders.length === 0) {
    return <View style={styles.center}><Text style={styles.muted}>{t("soc.no_orders")}</Text></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      {orders.map((o) => {
        const idx = FLOW.indexOf(o.status);
        const rejected = o.status === "REJECTED";
        return (
          <View key={o.order_uuid} style={styles.card}>
            <View style={styles.rowB}>
              <Text style={styles.amount}>{formatRupees(Number(o.total_amount))}</Text>
              <Text style={[styles.badge, rejected && styles.badgeRej]}>{label(o.status)}</Text>
            </View>
            {(o.items || []).map((it: any, i: number) => (
              <Text key={i} style={styles.muted}>{it.quantity} × {it.name}</Text>
            ))}
            {!rejected && (
              <View style={styles.steps}>
                {FLOW.map((s, i) => (
                  <View key={s} style={styles.step}>
                    <View style={[styles.dot, i <= idx && styles.dotDone]} />
                    <Text style={[styles.stepLbl, i === idx && styles.stepNow]}>{label(s)}</Text>
                  </View>
                ))}
              </View>
            )}
            {o.status === "DISPATCHED" && (
              <TouchableOpacity style={styles.btn} disabled={busy === o.order_uuid} onPress={() => confirmReceipt(o.order_uuid)}>
                {busy === o.order_uuid ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t("soc.confirm_receipt")}</Text>}
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  rowB: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  amount: { fontSize: 20, fontWeight: "800", color: "#1b5e20" },
  badge: { fontSize: 12, fontWeight: "700", color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  badgeRej: { color: "#b3261e", backgroundColor: "#fdecea" },
  muted: { color: "#888", fontSize: 13, marginTop: 2 },
  steps: { marginTop: 12, gap: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  dot: { width: 11, height: 11, borderRadius: 999, backgroundColor: "#ddd" },
  dotDone: { backgroundColor: "#2e7d32" },
  stepLbl: { fontSize: 13, color: "#888" },
  stepNow: { color: "#1b5e20", fontWeight: "700" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 13, alignItems: "center", marginTop: 12 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
