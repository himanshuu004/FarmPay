import { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

type Range = 7 | 14 | 30 | 90;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const CAT_COLORS: Record<string, string> = {
  FEED: "#2e7d32", FODDER: "#558b2f", LABOR: "#1565c0", MEDICINE: "#c62828",
  VET_TREATMENT: "#d84315", VACCINATION: "#6a1b9a", ELECTRICITY: "#f9a825",
  WATER: "#0288d1", TRANSPORT: "#5d4037", EQUIPMENT: "#455a64",
  HOUSING: "#6d4c41", INSURANCE: "#00838f", PURCHASE_ANIMAL: "#4e342e",
  AI_BREEDING: "#7b1fa2", NATURAL_SERVICE: "#8e24aa", OTHER: "#616161",
};

export default function DairyPnl() {
  const router = useRouter();
  const { t } = useI18n();
  const [range, setRange] = useState<Range>(14);
  const [view, setView] = useState<"herd" | "animal">("herd");
  const [loading, setLoading] = useState(true);
  const [herd, setHerd] = useState<any>(null);
  const [perAnimal, setPerAnimal] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const start = daysAgo(range);
      const end = daysAgo(0);
      const [h, p] = await Promise.all([
        apiGet(`/livestock/pnl/herd?startDate=${start}&endDate=${end}`),
        apiGet(`/livestock/pnl/per-animal?startDate=${start}&endDate=${end}`),
      ]);
      if (h.success) setHerd(h.data);
      if (p.success) setPerAnimal(p.data || []);
    } catch (e) {}
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  }

  const totalCost = Number(herd?.totalCost || 0);
  const totalRev = Number(herd?.totalRevenue || 0);
  const net = Number(herd?.netProfit || 0);
  const netColor = net >= 0 ? "#2e7d32" : "#c62828";

  const costCats = Object.entries(herd?.costByCategory || {})
    .sort((a: any, b: any) => b[1] - a[1]) as [string, number][];
  const maxCat = costCats[0]?.[1] || 1;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t("dairy.pnl.title")}</Text>
      </View>

      {/* Range selector */}
      <View style={s.chipRow}>
        {([7, 14, 30, 90] as Range[]).map((r) => (
          <TouchableOpacity
            key={r}
            style={[s.chip, range === r && s.chipSel]}
            onPress={() => setRange(r)}
          >
            <Text style={[s.chipText, range === r && s.chipTextSel]}>{r}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* View toggle */}
      <View style={[s.chipRow, { marginTop: 10 }]}>
        <TouchableOpacity style={[s.toggleBtn, view === "herd" && s.toggleBtnSel]} onPress={() => setView("herd")}>
          <Text style={[s.toggleText, view === "herd" && s.toggleTextSel]}>{t("dairy.pnl.herd_total")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.toggleBtn, view === "animal" && s.toggleBtnSel]} onPress={() => setView("animal")}>
          <Text style={[s.toggleText, view === "animal" && s.toggleTextSel]}>{t("dairy.pnl.per_animal")}</Text>
        </TouchableOpacity>
      </View>

      {view === "herd" ? (
        <>
          {/* Summary */}
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>{t("dairy.pnl.net_profit")}</Text>
            <Text style={[s.summaryNet, { color: netColor }]}>{formatRupees(net)}</Text>
            <View style={s.summaryRow}>
              <View style={s.summaryBox}>
                <Text style={s.summaryBoxLabel}>{t("dairy.pnl.revenue")}</Text>
                <Text style={[s.summaryBoxVal, { color: "#2e7d32" }]}>{formatRupees(totalRev)}</Text>
              </View>
              <View style={s.summaryBox}>
                <Text style={s.summaryBoxLabel}>{t("dairy.pnl.cost")}</Text>
                <Text style={[s.summaryBoxVal, { color: "#c62828" }]}>{formatRupees(totalCost)}</Text>
              </View>
            </View>
            <View style={[s.summaryRow, { marginTop: 8 }]}>
              <View style={s.summaryBox}>
                <Text style={s.summaryBoxLabel}>{t("dairy.pnl.formal")}</Text>
                <Text style={s.summaryBoxVal}>{formatRupees(Number(herd?.formalCost || 0))}</Text>
              </View>
              <View style={s.summaryBox}>
                <Text style={s.summaryBoxLabel}>{t("dairy.pnl.informal")}</Text>
                <Text style={s.summaryBoxVal}>{formatRupees(Number(herd?.informalCost || 0))}</Text>
              </View>
            </View>
          </View>

          {/* Cost categories */}
          <View style={s.card}>
            <Text style={s.cardLabel}>{t("dairy.pnl.cost_breakdown")}</Text>
            {costCats.length === 0 ? (
              <Text style={s.empty}>{t("dairy.pnl.no_costs")}</Text>
            ) : (
              costCats.map(([cat, amt]) => {
                const color = CAT_COLORS[cat] || "#616161";
                const pct = (amt / maxCat) * 100;
                return (
                  <View key={cat} style={{ marginBottom: 10 }}>
                    <View style={s.catRow}>
                      <Text style={[s.catName, { color }]}>{cat.replace(/_/g, " ")}</Text>
                      <Text style={s.catAmount}>{formatRupees(amt)}</Text>
                    </View>
                    <View style={s.bar}>
                      <View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </>
      ) : (
        <View>
          {perAnimal.length === 0 ? (
            <View style={s.card}>
              <Text style={s.empty}>{t("dairy.pnl.no_animals")}</Text>
            </View>
          ) : (
            perAnimal.map((a) => {
              const n = Number(a.netProfit);
              const color = n >= 0 ? "#2e7d32" : "#c62828";
              return (
                <View key={a.animalUuid} style={s.animalCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <Text style={s.animalEmoji}>🐄</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.animalName}>{a.name || a.tagNumber || t("dairy.pnl.unnamed")}</Text>
                      <Text style={s.animalStage}>{a.lifecycleStage?.replace(/_/g, " ")}</Text>
                    </View>
                    <Text style={[s.animalNet, { color }]}>{formatRupees(n)}</Text>
                  </View>
                  <View style={s.animalDetails}>
                    <View style={s.animalDetailRow}>
                      <Text style={s.animalDetailLabel}>{t("dairy.pnl.revenue_label")}</Text>
                      <Text style={[s.animalDetailVal, { color: "#2e7d32" }]}>
                        {formatRupees(Number(a.totalRevenue))}
                      </Text>
                    </View>
                    <View style={s.animalDetailRow}>
                      <Text style={s.animalDetailLabel}>  {t("dairy.pnl.direct")}</Text>
                      <Text style={s.animalDetailSub}>{formatRupees(Number(a.directRevenue))}</Text>
                    </View>
                    <View style={s.animalDetailRow}>
                      <Text style={s.animalDetailLabel}>  {t("dairy.pnl.allocated")}</Text>
                      <Text style={s.animalDetailSub}>{formatRupees(Number(a.allocatedRevenue))}</Text>
                    </View>
                    <View style={s.animalDetailRow}>
                      <Text style={s.animalDetailLabel}>{t("dairy.pnl.cost_label")}</Text>
                      <Text style={[s.animalDetailVal, { color: "#c62828" }]}>
                        {formatRupees(Number(a.totalCost))}
                      </Text>
                    </View>
                    <View style={s.animalDetailRow}>
                      <Text style={s.animalDetailLabel}>  {t("dairy.pnl.direct")}</Text>
                      <Text style={s.animalDetailSub}>{formatRupees(Number(a.directCost))}</Text>
                    </View>
                    <View style={s.animalDetailRow}>
                      <Text style={s.animalDetailLabel}>  {t("dairy.pnl.allocated")}</Text>
                      <Text style={s.animalDetailSub}>{formatRupees(Number(a.allocatedCost))}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f5f5f5" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  back: { fontSize: 28, color: "#1b5e20", fontWeight: "700" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1b5e20" },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1.5, borderColor: "#ddd", backgroundColor: "#fff" },
  chipSel: { borderColor: "#2e7d32", backgroundColor: "#e8f5e9" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#666" },
  chipTextSel: { color: "#1b5e20" },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#ddd", backgroundColor: "#fff", alignItems: "center" },
  toggleBtnSel: { borderColor: "#2e7d32", backgroundColor: "#e8f5e9" },
  toggleText: { fontSize: 13, fontWeight: "700", color: "#666" },
  toggleTextSel: { color: "#1b5e20" },
  summaryCard: { backgroundColor: "#1b5e20", borderRadius: 16, padding: 20, marginTop: 14, marginBottom: 14 },
  summaryTitle: { color: "#a5d6a7", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryNet: { fontSize: 32, fontWeight: "900", marginTop: 4, marginBottom: 16 },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, padding: 12 },
  summaryBoxLabel: { color: "#a5d6a7", fontSize: 11, marginBottom: 2 },
  summaryBoxVal: { color: "#fff", fontSize: 15, fontWeight: "800" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 },
  empty: { fontSize: 13, color: "#999", textAlign: "center", padding: 12 },
  catRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  catName: { fontSize: 12, fontWeight: "700" },
  catAmount: { fontSize: 12, fontWeight: "600", color: "#333" },
  bar: { height: 8, backgroundColor: "#f0f0f0", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  animalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginTop: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  animalEmoji: { fontSize: 28, marginRight: 10 },
  animalName: { fontSize: 15, fontWeight: "700", color: "#333" },
  animalStage: { fontSize: 11, color: "#888", marginTop: 2 },
  animalNet: { fontSize: 16, fontWeight: "800" },
  animalDetails: { backgroundColor: "#fafafa", borderRadius: 10, padding: 10 },
  animalDetailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  animalDetailLabel: { fontSize: 12, color: "#555" },
  animalDetailVal: { fontSize: 13, fontWeight: "700" },
  animalDetailSub: { fontSize: 11, color: "#888" },
});
