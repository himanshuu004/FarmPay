/**
 * Pashu Suraksha home — the protection snapshot ("N of M covered"), active
 * policies, and the paths to quote / enrol / claim / renew. NLM livestock only.
 * Wired to GET /api/v1/kavach/policies/me.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

export default function PashuHome() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet("/kavach/policies/me");
      if (res.success) setData(res.data);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const snap = data?.snapshot;
  const total = snap?.animalsTotal || 0;
  const covered = snap?.animalsCovered || 0;
  const fill = total ? covered / total : 0;
  const policies = data?.policies || [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.home.my_protection")}</Text>
        <View style={styles.rowB}>
          <Text style={styles.kpi}>{snap?.label || t("pashu.home.covered_default")}</Text>
          <Text style={styles.chip}>NLM</Text>
        </View>
        <View style={styles.meter}><View style={[styles.meterFill, { width: `${fill * 100}%` }]} /></View>
        <Text style={styles.muted}>{t("pashu.home.si_active")}: {formatRupees(snap?.sumInsuredTotal || 0)} · {Math.max(0, total - covered)} {t("pashu.home.uncovered")}</Text>
      </View>

      <View style={styles.actions}>
        <Action icon="🐄" label={t("pashu.act.animals")} onPress={() => router.push("/pashu-animals")} />
        <Action icon="🧮" label={t("pashu.act.quote")} onPress={() => router.push("/pashu-quote")} />
        <Action icon="🏷️" label={t("pashu.act.enrol")} onPress={() => router.push("/pashu-enrol")} />
        <Action icon="📋" label={t("pashu.act.claim")} onPress={() => router.push("/pashu-claim")} />
        <Action icon="🔄" label={t("pashu.act.renew")} onPress={() => router.push("/pashu-renew")} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.home.policies")}</Text>
        {policies.length === 0 ? (
          <Text style={styles.muted}>{t("pashu.home.no_policies")}</Text>
        ) : policies.map((p: any) => (
          <TouchableOpacity key={p.policy_uuid} style={styles.row}
            onPress={() => router.push({ pathname: "/pashu-vault", params: { policyUuid: p.policy_uuid } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t("pashu.home.policy")} · {t("pashu.si")} {formatRupees(Number(p.sum_insured))}</Text>
              <Text style={styles.muted}>{t("pashu.home.you_pay")} {formatRupees(Number(p.premium_farmer))} · {t("pashu.home.ends")} {p.end_date || "—"}</Text>
            </View>
            <Text style={[styles.badge, p.status !== "active" && styles.badgeMuted]}>{p.status}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.footer}>{t("pashu.home.footer_muzzle")}</Text>
    </ScrollView>
  );
}

function Action({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  rowB: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kpi: { fontSize: 24, fontWeight: "800", color: "#1b5e20" },
  chip: { fontSize: 12, fontWeight: "700", color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  meter: { height: 14, borderRadius: 999, backgroundColor: "#e8f0ea", overflow: "hidden", marginVertical: 10 },
  meterFill: { height: "100%", backgroundColor: "#2e7d32" },
  muted: { color: "#888", fontSize: 13, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  action: { width: "47%", backgroundColor: "#fff", borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#eee" },
  actionIcon: { fontSize: 26, marginBottom: 6 },
  actionLabel: { fontSize: 14, fontWeight: "700", color: "#1b5e20" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#333", fontWeight: "600" },
  badge: { fontSize: 11, fontWeight: "800", color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  badgeMuted: { color: "#888", backgroundColor: "#eee" },
  footer: { fontSize: 12, color: "#888", lineHeight: 18, marginBottom: 20 },
});
