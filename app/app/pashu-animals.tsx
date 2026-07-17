/**
 * Pashu Suraksha — animal registry. The herd from the dairy register with a
 * covered ✅ / uninsured badge per animal (§8C pashu-animals). Uninsured → enrol;
 * covered → its policy vault. Read from GET /kavach/assets/me (+ snapshot from
 * /kavach/policies/me). The 12-digit NDDB tag is the statutory identity.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet } from "../lib/api";
import { useI18n } from "../lib/i18n";

const SPECIES_ICON: Record<string, string> = {
  CATTLE: "🐄", BUFFALO: "🐃", GOAT: "🐐", SHEEP: "🐑", PIG: "🐖",
};

export default function PashuAnimals() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [animals, setAnimals] = useState<any[]>([]);
  const [snap, setSnap] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [as, pol] = await Promise.all([apiGet("/kavach/assets/me"), apiGet("/kavach/policies/me")]);
      if (as.success) setAnimals(as.data || []);
      if (pol.success) setSnap(pol.data?.snapshot || null);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const covered = animals.filter((a) => a.covered);
  const uninsured = animals.filter((a) => !a.covered);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.animals.my_herd")}</Text>
        <View style={styles.rowB}>
          <Text style={styles.kpi}>{snap?.label || `${covered.length} ${t("pashu.of")} ${animals.length} ${t("pashu.covered_lc")}`}</Text>
          <Text style={styles.chip}>NLM</Text>
        </View>
        <Text style={styles.muted}>{uninsured.length} {t("pashu.animals.uninsured_suffix")}</Text>
      </View>

      {animals.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{t("pashu.animals.empty")}</Text>
          <TouchableOpacity style={[styles.btnGhost, { marginTop: 12 }]} onPress={() => router.push("/dairy-animals")}>
            <Text style={styles.btnGhostText}>🐄 {t("pashu.animals.go_to_animals")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {uninsured.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("pashu.uninsured")}</Text>
          {uninsured.map((a) => (
            <TouchableOpacity key={a.animalId} style={styles.row}
              onPress={() => router.push({ pathname: "/pashu-quote", params: { animalId: String(a.animalId) } })}>
              <Text style={styles.icon}>{SPECIES_ICON[a.species] || "🐾"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{a.tagNumber || t("pashu.untagged")}</Text>
                <Text style={styles.muted}>{a.species || t("pashu.animal_word")}</Text>
              </View>
              <Text style={styles.cta}>{t("pashu.animals.insure_cta")}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {covered.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("pashu.insured")}</Text>
          {covered.map((a) => (
            <TouchableOpacity key={a.animalId} style={styles.row} disabled={!a.coverPolicyUuid}
              onPress={() => a.coverPolicyUuid && router.push({ pathname: "/pashu-vault", params: { policyUuid: a.coverPolicyUuid } })}>
              <Text style={styles.icon}>{SPECIES_ICON[a.species] || "🐾"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{a.tagNumber || t("pashu.untagged")}</Text>
                <Text style={styles.muted}>{a.species || t("pashu.animal_word")}{a.coverTagUid ? ` · UID ${a.coverTagUid}` : ""}</Text>
              </View>
              <Text style={styles.badge}>{t("pashu.covered_badge")}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Text style={styles.footer}>{t("pashu.animals.footer_tag")}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  rowB: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kpi: { fontSize: 22, fontWeight: "800", color: "#1b5e20" },
  chip: { fontSize: 12, fontWeight: "700", color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  icon: { fontSize: 24 },
  rowLabel: { fontSize: 15, color: "#222", fontWeight: "700", fontVariant: ["tabular-nums"] },
  muted: { color: "#888", fontSize: 13, marginTop: 2 },
  cta: { fontSize: 14, fontWeight: "700", color: "#b4530a" },
  badge: { fontSize: 11, fontWeight: "800", color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  btnGhost: { backgroundColor: "#e8f5e9", borderRadius: 12, padding: 13, alignItems: "center" },
  btnGhostText: { color: "#1b5e20", fontSize: 15, fontWeight: "700" },
  footer: { fontSize: 12, color: "#888", lineHeight: 18, marginBottom: 20 },
});
