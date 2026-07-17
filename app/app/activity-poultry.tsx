/**
 * Activity Poultry — Persona phase v1 stub.
 *
 * Detailed poultry tracking arrives in a later phase once the PoP seeds
 * and per-flock screens are built. For now just surface the edit form
 * and an honest "coming soon" message.
 */

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useI18n } from "../lib/i18n";

export default function ActivityPoultry() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#f5f5f5" }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🐔</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("dairy.poultry.title")}</Text>
          <Text style={styles.headerSub}>{t("dairy.poultry.sub")}</Text>
        </View>
      </View>
      {[
        { icon: "🐔", titleKey: "dairy.poultry.animals", descKey: "dairy.poultry.animals_desc", route: "/dairy-animals?species=POULTRY" },
        { icon: "💸", titleKey: "dairy.poultry.log_cost", descKey: "dairy.poultry.log_cost_desc", route: "/dairy-log-cost" },
        { icon: "💰", titleKey: "dairy.poultry.log_sale", descKey: "dairy.poultry.log_sale_desc", route: "/dairy-log-revenue" },
        { icon: "📊", titleKey: "dairy.poultry.pnl", descKey: "dairy.poultry.pnl_desc", route: "/dairy-pnl" },
        { icon: "✏️", titleKey: "dairy.poultry.edit", descKey: "dairy.poultry.edit_desc", route: "/setup-poultry?mode=edit" },
      ].map((item) => (
        <TouchableOpacity key={item.titleKey} style={styles.card} onPress={() => router.push(item.route as any)} activeOpacity={0.85}>
          <Text style={styles.cardEmoji}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{t(item.titleKey)}</Text>
            <Text style={styles.cardDesc}>{t(item.descKey)}</Text>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </TouchableOpacity>
      ))}
      <View style={styles.info}>
        <Text style={styles.infoText}>
          {t("dairy.poultry.coming_soon")}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerEmoji: { fontSize: 34 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#e65100" },
  headerSub: { fontSize: 12, color: "#666", marginTop: 2 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10,
    flexDirection: "row", alignItems: "center", gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  cardEmoji: { fontSize: 22 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#333" },
  cardDesc: { fontSize: 12, color: "#888", marginTop: 2 },
  cardArrow: { fontSize: 22, color: "#ccc" },
  info: { backgroundColor: "#fff3e0", borderRadius: 12, padding: 16, marginTop: 8 },
  infoText: { fontSize: 13, color: "#bf360c", lineHeight: 19 },
});
