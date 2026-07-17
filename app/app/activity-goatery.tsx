/**
 * Activity Goatery — Persona phase v1 stub.
 */

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useI18n } from "../lib/i18n";

export default function ActivityGoatery() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#f5f5f5" }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🐐</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("dairy.goatery.title")}</Text>
          <Text style={styles.headerSub}>{t("dairy.goatery.sub")}</Text>
        </View>
      </View>
      {[
        { icon: "🐐", titleKey: "dairy.goatery.animals", descKey: "dairy.goatery.animals_desc", route: "/dairy-animals?species=GOAT" },
        { icon: "💸", titleKey: "dairy.goatery.log_cost", descKey: "dairy.goatery.log_cost_desc", route: "/dairy-log-cost" },
        { icon: "💰", titleKey: "dairy.goatery.log_sale", descKey: "dairy.goatery.log_sale_desc", route: "/dairy-log-revenue" },
        { icon: "📊", titleKey: "dairy.goatery.pnl", descKey: "dairy.goatery.pnl_desc", route: "/dairy-pnl" },
        { icon: "✏️", titleKey: "dairy.goatery.edit", descKey: "dairy.goatery.edit_desc", route: "/setup-goatery?mode=edit" },
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerEmoji: { fontSize: 34 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#6a1b9a" },
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
  info: { backgroundColor: "#f3e5f5", borderRadius: 12, padding: 16, marginTop: 8 },
  infoText: { fontSize: 13, color: "#4a148c", lineHeight: 19 },
});
