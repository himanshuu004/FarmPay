/**
 * Activity Dairy — Persona phase per-activity drill-in for DAIRY.
 *
 * Thin wrapper that provides shortcuts to the existing dairy screens.
 * Per-animal management still happens in /dairy-animals and friends —
 * this screen just groups them under one persona-aligned header with
 * an edit shortcut back to the aggregate herd form.
 */

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import ActivityMoneySection from "../components/ActivityMoneySection";
import { useI18n } from "../lib/i18n";

const LINKS = [
  { icon: "🐄", labelKey: "dairy.hub.animals", descKey: "dairy.hub.animals_desc", route: "/dairy-animals" },
  { icon: "📒", labelKey: "dairy.hub.logbook", descKey: "dairy.hub.logbook_desc", route: "/dairy-logbook" },
  { icon: "💊", labelKey: "dairy.hub.treatment", descKey: "dairy.hub.treatment_desc", route: "/dairy-treatment" },
  { icon: "📈", labelKey: "dairy.hub.pnl", descKey: "dairy.hub.pnl_desc", route: "/dairy-pnl" },
];

export default function ActivityDairy() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerEmoji}>🐄</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t("dairy.hub.title")}</Text>
            <Text style={styles.headerSub}>{t("dairy.hub.sub")}</Text>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push("/setup-dairy?mode=edit" as any)}
          >
            <Text style={styles.editBtnText}>{t("dairy.hub.edit_herd")}</Text>
          </TouchableOpacity>
        </View>

        {/* Contextual money discovery — surfaces bank loans tagged to
            DAIRY (loan_type === 'dairy_loan') and a link to the
            bookmarks list. Lives inline above the dairy management
            links so a farmer browsing her herd doesn't need to bounce
            to the Loans tab to find loan-related money for this
            activity. Self-contained component, reused in activity-crop
            and activity-horti with the matching activityCode. */}
        <ActivityMoneySection activityCode="DAIRY" />

        {LINKS.map((item) => (
          <TouchableOpacity
            key={item.labelKey}
            style={styles.card}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.cardEmoji}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t(item.labelKey)}</Text>
              <Text style={styles.cardDesc}>{t(item.descKey)}</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: 90 }} />
      </ScrollView>

      <View style={styles.stickyBottom}>
        <TouchableOpacity
          style={[styles.stickyBtn, { backgroundColor: "#2e7d32" }]}
          onPress={() => router.push("/society-passbook" as any)}
        >
          <Text style={styles.stickyBtnText}>{t("dairy.hub.my_society")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.stickyBtn, { backgroundColor: "#1565c0" }]}
          onPress={() => router.push("/society-orders" as any)}
        >
          <Text style={styles.stickyBtnText}>{t("dairy.hub.my_orders")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  headerEmoji: { fontSize: 34 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#4e342e" },
  headerSub: { fontSize: 12, color: "#666", marginTop: 2 },
  editBtn: { backgroundColor: "#efebe9", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText: { fontSize: 11, fontWeight: "800", color: "#4e342e" },

  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10,
    flexDirection: "row", alignItems: "center", gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  cardEmoji: { fontSize: 26 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#333" },
  cardDesc: { fontSize: 12, color: "#888", marginTop: 2 },
  cardArrow: { fontSize: 22, color: "#ccc" },

  stickyBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", gap: 8, padding: 12,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e8e8e8",
  },
  stickyBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  stickyBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
