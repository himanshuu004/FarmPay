import { useState, useEffect, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function DairyLogbook() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [animals, setAnimals] = useState<any[]>([]);
  const [pnl, setPnl] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pRes = await apiGet("/livestock/profile");
      if (pRes.success) setProfile(pRes.data);

      const aRes = await apiGet("/livestock/animals");
      if (aRes.success) setAnimals(aRes.data || []);

      const start = daysAgo(14);
      const end = daysAgo(0);
      const pnlRes = await apiGet(`/livestock/pnl/herd?startDate=${start}&endDate=${end}`);
      if (pnlRes.success) setPnl(pnlRes.data);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  }

  // No profile yet — redirect to onboarding
  if (!profile) {
    return (
      <View style={s.center}>
        <Text style={s.emptyEmoji}>🐄</Text>
        <Text style={s.emptyTitle}>{t("dairy.log.setup_first_title")}</Text>
        <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/dairy-onboarding" as any)}>
          <Text style={s.emptyBtnText}>{t("dairy.log.start_setup")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalCost = Number(pnl?.totalCost || 0);
  const totalRev = Number(pnl?.totalRevenue || 0);
  const net = totalRev - totalCost;
  const netColor = net >= 0 ? "#2e7d32" : "#c62828";

  const actions = [
    { icon: "🥛", labelKey: "dairy.log.act_milk",     route: "/dairy-log-revenue" },
    { icon: "💰", labelKey: "dairy.log.act_expense",  route: "/dairy-log-cost" },
    { icon: "🐄", labelKey: "dairy.log.act_animals",  route: "/dairy-animals" },
    { icon: "💉", labelKey: "dairy.log.act_vet",      route: "/dairy-treatment" },
    { icon: "🤰", labelKey: "dairy.log.act_breeding", route: "/dairy-breeding" },
    { icon: "📊", labelKey: "dairy.log.act_pnl",      route: "/dairy-pnl" },
  ];

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerEmoji}>🐄</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t("dairy.log.title")}</Text>
          <Text style={s.headerSub}>
            {profile.herd_tier} {t("dairy.log.tier")} · {profile.entry_mode === "WEEKLY_BULK" ? t("dairy.log.entry_weekly") : t("dairy.log.entry_daily")} {t("dairy.log.entry_word")}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/dairy-onboarding" as any)}>
          <Text style={s.headerGear}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* P&L snapshot */}
      <View style={s.card}>
        <Text style={s.cardLabel}>{t("dairy.log.last_14")}</Text>
        <View style={s.pnlRow}>
          <View style={s.pnlBox}>
            <Text style={s.pnlBoxLabel}>{t("dairy.log.revenue")}</Text>
            <Text style={[s.pnlBoxValue, { color: "#2e7d32" }]}>{formatRupees(totalRev)}</Text>
          </View>
          <View style={s.pnlBox}>
            <Text style={s.pnlBoxLabel}>{t("dairy.log.cost")}</Text>
            <Text style={[s.pnlBoxValue, { color: "#c62828" }]}>{formatRupees(totalCost)}</Text>
          </View>
          <View style={s.pnlBox}>
            <Text style={s.pnlBoxLabel}>{t("dairy.log.net")}</Text>
            <Text style={[s.pnlBoxValue, { color: netColor }]}>{formatRupees(net)}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push("/dairy-pnl" as any)} style={s.pnlLink}>
          <Text style={s.pnlLinkText}>{t("dairy.log.view_full_pnl")}</Text>
        </TouchableOpacity>
      </View>

      {/* Herd card */}
      <TouchableOpacity style={s.card} onPress={() => router.push("/dairy-animals" as any)} activeOpacity={0.7}>
        <Text style={s.cardLabel}>{t("dairy.log.my_herd")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={s.herdCount}>{animals.length}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.herdLabel}>{t("dairy.log.animals_active")}</Text>
            <Text style={s.herdSub}>
              {animals.filter((a) => a.current_lifecycle_stage?.includes("LACTATION")).length} {t("dairy.log.lactating")} ·{" "}
              {animals.filter((a) => a.current_lifecycle_stage === "PREGNANT").length} {t("dairy.log.pregnant")}
            </Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </View>
      </TouchableOpacity>

      {/* Quick actions grid */}
      <Text style={s.sectionTitle}>{t("dairy.log.quick_actions")}</Text>
      <View style={s.grid}>
        {actions.map((a, i) => (
          <TouchableOpacity
            key={i}
            style={s.actionCard}
            onPress={() => router.push(a.route as any)}
            activeOpacity={0.7}
          >
            <Text style={s.actionIcon}>{a.icon}</Text>
            <Text style={s.actionLabel}>{t(a.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f5f5f5", padding: 20 },
  emptyEmoji: { fontSize: 64, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#333" },
  emptySub: { fontSize: 13, color: "#888", marginTop: 4, marginBottom: 20 },
  emptyBtn: { backgroundColor: "#2e7d32", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  header: { backgroundColor: "#1b5e20", borderRadius: 16, padding: 18, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  headerEmoji: { fontSize: 32 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  headerSub: { color: "#a5d6a7", fontSize: 12, marginTop: 2 },
  headerGear: { fontSize: 22 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  pnlRow: { flexDirection: "row", gap: 8 },
  pnlBox: { flex: 1, backgroundColor: "#fafafa", borderRadius: 10, padding: 12, alignItems: "center" },
  pnlBoxLabel: { fontSize: 11, color: "#888", marginBottom: 4 },
  pnlBoxValue: { fontSize: 15, fontWeight: "800" },
  pnlLink: { marginTop: 12, alignSelf: "flex-end" },
  pnlLinkText: { color: "#2e7d32", fontSize: 13, fontWeight: "700" },
  herdCount: { fontSize: 36, fontWeight: "900", color: "#1b5e20" },
  herdLabel: { fontSize: 14, fontWeight: "700", color: "#333" },
  herdSub: { fontSize: 11, color: "#888", marginTop: 2 },
  arrow: { fontSize: 28, color: "#2e7d32" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#333", marginBottom: 10, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: { width: "31%", backgroundColor: "#fff", borderRadius: 14, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#e8f5e9", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  actionIcon: { fontSize: 26, marginBottom: 6 },
  actionLabel: { fontSize: 11, fontWeight: "700", color: "#333", textAlign: "center" },
  actionLabelHi: { fontSize: 9, color: "#888", marginTop: 1, textAlign: "center" },
});
