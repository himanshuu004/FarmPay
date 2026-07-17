/**
 * Setup Poultry — Persona phase v1 stub
 *
 * Aggregate flock form skeleton. v1 ships without the full poultry PoP
 * wiring — the farmer enters total flock size + broiler / layer / native
 * counts, we flip setup_complete on the POULTRY subscription, and land
 * back at resume-setup. Detailed per-unit screens come in a future phase.
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { apiGet, apiPatch } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { FieldLabel, Stepper, BigInput, Card, MoreDetails, SaveButton } from "../components/FormKit";

export default function SetupPoultry() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditMode = params.mode === "edit";

  const [saving, setSaving] = useState(false);
  const [broilers, setBroilers] = useState(0);
  const [layers, setLayers] = useState(0);
  const [native, setNative] = useState(0);

  const total = broilers + layers + native;

  const onSave = async () => {
    if (total === 0) {
      Alert.alert(t("dairy.psetup.need_one_title"), t("dairy.psetup.need_one_msg"));
      return;
    }
    setSaving(true);
    try {
      // v1: no dedicated poultry aggregate endpoint yet — just flip the
      // setup_complete flag on the POULTRY subscription via the generic
      // PATCH endpoint. Counts are stored in notes as a quick workaround.
      const list = await apiGet("/farmer/activity-subscriptions");
      const poultry = (list?.data?.items || []).find((s: any) => s.activityCode === "POULTRY");
      if (!poultry) {
        Alert.alert(t("dairy.psetup.no_sub_title"), t("dairy.psetup.no_sub_msg"));
        setSaving(false);
        return;
      }
      const notes = `broilers=${broilers}, layers=${layers}, native=${native}, total=${total}`;
      const r = await apiPatch(`/farmer/activity-subscriptions/${poultry.subscriptionId}`, {
        isSetupComplete: true,
        notes,
      });
      if (r?.success) {
        Alert.alert(t("dairy.setup.saved_title"), t("dairy.psetup.saved_msg"), [
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
        <Text style={s.emoji}>🐔</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{isEditMode ? t("dairy.psetup.edit_title") : t("dairy.psetup.new_title")}</Text>
          <Text style={s.subtitle}>
            {t("dairy.psetup.sub")}
          </Text>
        </View>
      </View>

      <Card>
        <FieldLabel en="Broilers" hi="मुर्गी (ब्रॉयलर)" />
        <Stepper value={broilers} onChange={setBroilers} max={9999} />

        <FieldLabel en="Layers" hi="मुर्गी (अंडा)" />
        <Stepper value={layers} onChange={setLayers} max={9999} />

        <MoreDetails label={t("dairy.psetup.big_flock")}>
          <View style={s.two}>
            <View style={s.col}>
              <Text style={s.mini}>{t("dairy.psetup.broilers_count")}</Text>
              <BigInput value={String(broilers || "")} onChangeText={(v) => setBroilers(parseInt(v, 10) || 0)} placeholder="0" numeric />
            </View>
            <View style={s.col}>
              <Text style={s.mini}>{t("dairy.psetup.layers_count")}</Text>
              <BigInput value={String(layers || "")} onChangeText={(v) => setLayers(parseInt(v, 10) || 0)} placeholder="0" numeric />
            </View>
          </View>
        </MoreDetails>

        <FieldLabel en="Native / desi" hi="देसी मुर्गी" />
        <Stepper value={native} onChange={setNative} max={9999} />
      </Card>

      <Card>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>{t("dairy.psetup.total")}</Text>
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
  title: { fontSize: 20, fontWeight: "800", color: "#e65100" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 2, lineHeight: 18 },
  two: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  mini: { fontSize: 12, color: "#999", marginTop: 8, marginBottom: 4, fontWeight: "600" },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { fontSize: 14, fontWeight: "700", color: "#e65100" },
  summaryValue: { fontSize: 24, fontWeight: "800", color: "#bf360c" },
});
