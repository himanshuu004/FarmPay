/**
 * Setup Goatery — Persona phase v1 stub
 *
 * Aggregate herd form for goats + sheep. Same stub pattern as
 * setup-poultry — flips setup_complete on the GOATERY subscription
 * via PATCH and stores counts in the notes field for v1.
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { apiGet, apiPatch } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { FieldLabel, Stepper, Card, SaveButton } from "../components/FormKit";

export default function SetupGoatery() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditMode = params.mode === "edit";

  const [saving, setSaving] = useState(false);
  const [stallFed, setStallFed] = useState(0);
  const [grazing, setGrazing] = useState(0);
  const [sheep, setSheep] = useState(0);

  const total = stallFed + grazing + sheep;

  const onSave = async () => {
    if (total === 0) {
      Alert.alert(t("dairy.gsetup.need_one_title"), t("dairy.gsetup.need_one_msg"));
      return;
    }
    setSaving(true);
    try {
      const list = await apiGet("/farmer/activity-subscriptions");
      const goatery = (list?.data?.items || []).find((s: any) => s.activityCode === "GOATERY");
      if (!goatery) {
        Alert.alert(t("dairy.gsetup.no_sub_title"), t("dairy.gsetup.no_sub_msg"));
        setSaving(false);
        return;
      }
      const notes = `stall_fed=${stallFed}, grazing=${grazing}, sheep=${sheep}, total=${total}`;
      const r = await apiPatch(`/farmer/activity-subscriptions/${goatery.subscriptionId}`, {
        isSetupComplete: true,
        notes,
      });
      if (r?.success) {
        Alert.alert(t("dairy.setup.saved_title"), t("dairy.gsetup.saved_msg"), [
          { text: t("dairy.setup.continue_setup"), onPress: () => {
            if (isEditMode) router.replace("/activity-dairy");
            else router.replace("/activity-dairy" as any);
          }},
          { text: t("dairy.setup.back_home"), style: "cancel", onPress: () => router.replace("/activity-dairy") },
        ]);
      } else {
        Alert.alert(t("dairy.setup.save_failed"), r?.message || t("dairy.setup.please_try_again"));
      }
    } catch (e: any) {
      Alert.alert(t("dairy.setup.save_failed"), e?.message || t("dairy.setup.please_try_again"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={s.header}>
        <Text style={s.emoji}>🐐</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{isEditMode ? t("dairy.setup.edit_title") : t("dairy.setup.new_title")}</Text>
          <Text style={s.subtitle}>
            {t("dairy.gsetup.sub")}
          </Text>
        </View>
      </View>

      <Card>
        <FieldLabel en="Stall-fed goats" hi="बकरी (बंधी)" />
        <Stepper value={stallFed} onChange={setStallFed} />

        <FieldLabel en="Grazing goats" hi="बकरी (चराई)" />
        <Stepper value={grazing} onChange={setGrazing} />

        <FieldLabel en="Sheep" hi="भेड़ · संख्या" />
        <Stepper value={sheep} onChange={setSheep} />
      </Card>

      <Card>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>{t("dairy.gsetup.total")}</Text>
          <Text style={s.summaryValue}>{total}</Text>
        </View>
      </Card>

      <SaveButton
        en={isEditMode ? "Save changes" : "Save & lock"}
        hi="सहेजें"
        onPress={onSave}
        saving={saving}
        disabled={total === 0}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  emoji: { fontSize: 36 },
  title: { fontSize: 20, fontWeight: "800", color: "#6a1b9a" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 2, lineHeight: 18 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { fontSize: 14, fontWeight: "700", color: "#6a1b9a" },
  summaryValue: { fontSize: 24, fontWeight: "800", color: "#4a148c" },
});
