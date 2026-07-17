/**
 * Society input ordering — catalog → cart → submit. The app authors only the
 * DRAFT→SUBMIT transition; the order is gated on the demand window (1st/3rd week)
 * and the 70% limit, both enforced server-side. Wired to /api/v1/coop.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { FieldLabel, Stepper, Card, SaveButton } from "../components/FormKit";

export default function SocietyOrder() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [limit, setLimit] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, pb] = await Promise.all([apiGet("/coop/catalog"), apiGet("/coop/passbook")]);
      if (cat.success) setItems(cat.data || []);
      if (pb.success && pb.data?.isMember !== false) setLimit(pb.data?.availableOrderLimit ?? 0);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setQty = (sku: string, q: number) =>
    setCart((c) => ({ ...c, [sku]: Math.max(0, q) }));

  const total = items.reduce((s, it) => s + (cart[it.sku] || 0) * Number(it.subsidisedPrice), 0);
  const overLimit = total > limit;

  const submit = async () => {
    const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([sku, quantity]) => ({ sku, quantity }));
    if (lines.length === 0) { Alert.alert(t("soc.empty_cart_title"), t("soc.empty_cart_msg")); return; }
    setSubmitting(true);
    try {
      const draft = await apiPost("/coop/orders", { lines });
      if (!draft.success) { Alert.alert(t("soc.order_create_fail"), draft.message || t("common.try_again")); return; }
      const sub = await apiPost(`/coop/orders/${draft.data.orderUuid}/submit`, {});
      if (sub.success) {
        Alert.alert(t("soc.order_submitted_title"), t("soc.order_submitted_msg"));
        setCart({});
        router.replace("/society-orders");
      } else {
        // Server-side gate: window closed or over the 70% limit.
        Alert.alert(t("soc.not_submitted_title"), sub.message || t("soc.not_submitted_msg"));
      }
    } catch (e) {
      Alert.alert(t("common.error"), t("soc.connect_society_fail"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  return (
    <View style={s.screen}>
      <View style={s.limitBar}>
        <Text style={s.limitLabel}>{t("soc.available_credit")}</Text>
        <Text style={[s.limitVal, overLimit && { color: "#b3261e" }]}>{formatRupees(limit)}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 160 }}>
        <Card>
          <FieldLabel en="Choose items to order" hi="ऑर्डर के लिए सामान चुनें" />
          {items.map((it) => (
            <View key={it.sku} style={s.item}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{it.name}</Text>
                <Text style={s.mini}>{formatRupees(it.subsidisedPrice)} / {it.unit}</Text>
              </View>
              <Stepper value={cart[it.sku] || 0} onChange={(q) => setQty(it.sku, q)} />
            </View>
          ))}
          {items.length === 0 ? <Text style={s.mini}>{t("soc.no_items")}</Text> : null}
        </Card>
      </ScrollView>
      <View style={s.footer}>
        <View style={s.rowB}>
          <Text style={s.totalLabel}>{t("soc.total")}</Text>
          <Text style={[s.total, overLimit && { color: "#b3261e" }]}>{formatRupees(total)}</Text>
        </View>
        {overLimit ? <Text style={s.warn}>{t("soc.over_limit_warn")}</Text> : null}
        <SaveButton en="Submit order" hi="ऑर्डर भेजें" onPress={submit} saving={submitting} disabled={overLimit} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  limitBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#e8f5e9", padding: 12, paddingHorizontal: 16 },
  limitLabel: { color: "#1b5e20", fontWeight: "600", fontSize: 13 },
  limitVal: { color: "#1b5e20", fontWeight: "800", fontSize: 16 },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0", gap: 12 },
  itemName: { fontSize: 15, fontWeight: "600", color: "#222" },
  mini: { fontSize: 12, color: "#999", marginTop: 4, fontWeight: "600" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", padding: 16, borderTopWidth: 1, borderTopColor: "#eee" },
  rowB: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  totalLabel: { fontSize: 15, color: "#555", fontWeight: "600" },
  total: { fontSize: 22, fontWeight: "800", color: "#1b5e20" },
  warn: { color: "#b3261e", fontSize: 12, marginBottom: 8 },
});
