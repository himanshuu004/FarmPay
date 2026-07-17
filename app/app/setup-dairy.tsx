/**
 * Setup Dairy — Persona phase aggregate herd entry
 *
 * First-time setup for the DAIRY activity. The farmer enters aggregate
 * counts (cows / buffaloes / mixed + average daily milk), hits Save & lock,
 * and the backend creates N placeholder rows in dairy_animals AND flips
 * the farmer's DAIRY activity subscription setup_complete = true.
 *
 * Also reused in EDIT mode from the persona home (?mode=edit), pre-fills
 * counts from the current active herd.
 *
 * Wired to POST /livestock/herd/aggregate (prefill: GET /livestock/herd/summary).
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { apiGet, apiPost } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { FieldLabel, Stepper, Card, SaveButton } from "../components/FormKit";

type Counts = { cows: number; buffaloes: number; mixed: number; avgDailyMilkLiters: number };

export default function SetupDairy() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditMode = params.mode === "edit";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Counts>({
    cows: 0,
    buffaloes: 0,
    mixed: 0,
    avgDailyMilkLiters: 10,
  });

  const total = counts.cows + counts.buffaloes + counts.mixed;

  // Prefill from existing herd on edit mode
  const load = useCallback(async () => {
    try {
      // Best-effort: pull existing dairy animals count for edit-mode prefill.
      // On first-time setup, this will just return empty and we start at 0.
      const r = await apiGet("/livestock/herd/summary").catch(() => null);
      const data = r?.data || {};
      if (data.counts) {
        setCounts({
          cows: data.counts.cows || 0,
          buffaloes: data.counts.buffaloes || 0,
          mixed: data.counts.mixed || 0,
          avgDailyMilkLiters: data.avgDailyMilkLiters || 10,
        });
      }
    } catch {
      /* first-time setup — defaults are fine */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSave = async () => {
    if (total === 0) {
      Alert.alert(t("dairy.setup.need_one_title"), t("dairy.setup.need_one_msg"));
      return;
    }
    setSaving(true);
    try {
      const r = await apiPost("/livestock/herd/aggregate", counts);
      if (r?.success) {
        Alert.alert(t("dairy.setup.saved_title"), t("dairy.setup.saved_msg"), [
          { text: t("dairy.setup.continue_setup"), onPress: () => {
            if (isEditMode) router.replace("/activity-dairy");
            else router.replace("/resume-setup" as any);
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

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={s.header}>
        <Text style={s.emoji}>🐄</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{isEditMode ? t("dairy.setup.edit_title") : t("dairy.setup.new_title")}</Text>
          <Text style={s.subtitle}>
            {isEditMode ? t("dairy.setup.edit_sub") : t("dairy.setup.new_sub")}
          </Text>
        </View>
      </View>

      <Card>
        <FieldLabel en="Cows" hi="गाय · संख्या" />
        <Stepper value={counts.cows} onChange={(v) => setCounts({ ...counts, cows: v })} max={99} />

        <FieldLabel en="Buffaloes" hi="भैंस · संख्या" />
        <Stepper value={counts.buffaloes} onChange={(v) => setCounts({ ...counts, buffaloes: v })} max={99} />

        <FieldLabel en="Mixed / other" hi="अन्य पशु" />
        <Stepper value={counts.mixed} onChange={(v) => setCounts({ ...counts, mixed: v })} max={99} />
      </Card>

      <Card>
        <FieldLabel en="Avg daily milk (litres)" hi="औसत दूध · लीटर" />
        <Stepper
          value={counts.avgDailyMilkLiters}
          onChange={(v) => setCounts({ ...counts, avgDailyMilkLiters: v })}
          min={0}
          max={500}
        />
      </Card>

      <View style={s.summary}>
        <Text style={s.summaryLabel}>{t("dairy.setup.total")}</Text>
        <Text style={s.summaryValue}>{total}</Text>
      </View>

      <SaveButton
        en={isEditMode ? "Save changes" : "Save & lock"}
        hi="सहेजें"
        onPress={onSave}
        saving={saving}
        disabled={total === 0}
      />

      {!isEditMode && (
        <Text style={s.hint}>
          {t("dairy.setup.hint")}
        </Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f5f5f5" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  emoji: { fontSize: 36 },
  title: { fontSize: 20, fontWeight: "800", color: "#1b5e20" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 2, lineHeight: 18 },
  summary: {
    backgroundColor: "#e8f5e9",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: { fontSize: 13, fontWeight: "700", color: "#2e7d32" },
  summaryValue: { fontSize: 22, fontWeight: "800", color: "#1b5e20" },
  hint: { fontSize: 12, color: "#888", textAlign: "center", lineHeight: 18, paddingHorizontal: 20, marginTop: 12 },
});
