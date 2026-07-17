/**
 * KCC calculator — the composite limit built from the farmer's ACTUAL animals on
 * record (the ERP-fed register), not a typed number. Three farmer features:
 *   1. units come LIVE from the logged register (never hand-typed)
 *   2. the farmer picks PARTICULAR animals to raise the KCC against (a subset)
 *   3. a SOLD animal auto-drops from the limit (status ≠ ACTIVE → not counted)
 * The statutory math stays server-side; this screen only selects + shows it.
 * Wired to GET /livestock/animals (+ ?status=SOLD) and POST /kcc/calculate.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

const SPECIES_ICON: Record<string, string> = { CATTLE: "🐄", BUFFALO: "🐃", GOAT: "🐐", SHEEP: "🐑" };

export default function KccCalculator() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [animals, setAnimals] = useState<any[]>([]);
  const [sold, setSold] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<any>(null);

  const compute = useCallback(async (uuids: string[]) => {
    if (uuids.length === 0) { setResult(null); return; }
    setComputing(true);
    try {
      const res = await apiPost("/kcc/calculate", { activities: [{ code: "DAIRY", animalUuids: uuids }] });
      setResult(res.success ? res.data : null);
    } catch (e) {}
    setComputing(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [act, sld] = await Promise.all([
        apiGet("/livestock/animals"),
        apiGet("/livestock/animals?status=SOLD").catch(() => ({ success: false })),
      ]);
      const list = act.success ? (act.data || []) : [];
      setAnimals(list);
      setSold(sld.success ? (sld.data || []) : []);
      const all = new Set<string>(list.map((a: any) => a.animal_uuid));
      setSelected(all);
      compute(Array.from(all));
    } catch (e) {}
    setLoading(false);
  }, [compute]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = (uuid: string) => {
    const next = new Set(selected);
    next.has(uuid) ? next.delete(uuid) : next.add(uuid);
    setSelected(next);
    compute(Array.from(next));
  };

  const markSold = (a: any) => {
    Alert.alert(t("kcc.sold_confirm_title"), `${a.tag_number || a.name || t("kcc.animal_word")} ${t("kcc.sold_confirm_msg")}`, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("kcc.yes_sold"), style: "destructive", onPress: async () => {
          const res = await apiPost(`/livestock/animals/${a.animal_uuid}/exit`, {
            exitReason: "SOLD", exitDate: new Date().toISOString().slice(0, 10),
            exitValue: Number(a.current_market_value) || 0, buyerName: "",
          });
          if (res.success) load();
          else Alert.alert(t("kcc.could_not_update"), res.message || t("common.try_again"));
        },
      },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  if (animals.length === 0 && sold.length === 0) {
    return (
      <View style={styles.centerPad}>
        <Text style={styles.emoji}>🐄</Text>
        <Text style={styles.h1}>{t("kcc.no_animals")}</Text>
        <Text style={styles.muted}>{t("kcc.no_animals_msg")}</Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={() => router.push("/dairy-animals")}>
          <Text style={styles.btnText}>{t("kcc.go_to_animals")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{t("kcc.calc_banner")}</Text>
      </View>

      {/* Selectable animals from the register */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("kcc.your_animals")} ({selected.size}/{animals.length} {t("kcc.selected_word")})</Text>
        {animals.map((a) => {
          const on = selected.has(a.animal_uuid);
          return (
            <View key={a.animal_uuid} style={styles.animalRow}>
              <TouchableOpacity style={styles.animalMain} onPress={() => toggle(a.animal_uuid)} activeOpacity={0.7}>
                <View style={[styles.box, on && styles.boxOn]}>{on ? <Text style={styles.boxTick}>✓</Text> : null}</View>
                <Text style={styles.animalIcon}>{SPECIES_ICON[a.species] || "🐾"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.animalTag}>{a.name || a.tag_number || t("kcc.animal_word")}</Text>
                  <Text style={styles.animalSub}>{a.species || "—"}{a.current_market_value ? ` · ${t("kcc.value_word")} ${formatRupees(Number(a.current_market_value))}` : ""}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => markSold(a)} style={styles.soldBtn}><Text style={styles.soldBtnText}>{t("kcc.sold_q")}</Text></TouchableOpacity>
            </View>
          );
        })}
        <Text style={styles.hint}>{t("kcc.units_live_hint")}</Text>
      </View>

      {/* Sold / exited — shown as excluded */}
      {sold.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("kcc.sold_exited")}</Text>
          {sold.map((a) => (
            <View key={a.animal_uuid} style={styles.soldRow}>
              <Text style={styles.animalIcon}>{SPECIES_ICON[a.species] || "🐾"}</Text>
              <Text style={styles.soldName}>{a.name || a.tag_number || t("kcc.animal_word")}</Text>
              <Text style={styles.soldTag}>{a.status}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Live limit */}
      <View style={[styles.card, styles.limitCard]}>
        <Text style={styles.limitLabel}>{t("kcc.composite_limit")}</Text>
        {computing ? <ActivityIndicator color="#fff" style={{ marginVertical: 8 }} /> : (
          <Text style={styles.limitVal}>{result ? formatRupees(result.cmpl) : "—"}</Text>
        )}
        <Text style={styles.limitSub}>{selected.size} {selected.size === 1 ? t("kcc.animal_one") : t("kcc.animal_many")} · {t("kcc.collateral_free_full")}</Text>
      </View>

      {result && !computing ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("kcc.six_year_schedule")}</Text>
          {(result.mpl || []).map((m: number, i: number) => (
            <Row key={i} label={`${t("kcc.year_word")} ${i + 1}`} value={formatRupees(m)} />
          ))}
        </View>
      ) : null}

      <TouchableOpacity style={[styles.btn, selected.size === 0 && styles.btnDim]} disabled={selected.size === 0}
        onPress={() => router.push({ pathname: "/kcc-apply", params: { animalUuids: JSON.stringify(Array.from(selected)) } })}>
        <Text style={styles.btnText}>{t("kcc.apply_this_kcc")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={() => router.push("/kcc-eligibility")}>
        <Text style={styles.linkText}>{t("kcc.check_eligibility")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowVal}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  centerPad: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 32 },
  emoji: { fontSize: 44, marginBottom: 8 },
  h1: { fontSize: 22, fontWeight: "800", color: "#1b5e20", marginBottom: 8 },
  banner: { backgroundColor: "#e6f0f6", borderRadius: 12, padding: 12, marginBottom: 12 },
  bannerText: { color: "#0b5c8a", fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, fontWeight: "700" },
  animalRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f4f4f4" },
  animalMain: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: "#bbb", alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  boxTick: { color: "#fff", fontSize: 15, fontWeight: "800" },
  animalIcon: { fontSize: 24 },
  animalTag: { fontSize: 15, fontWeight: "700", color: "#222" },
  animalSub: { fontSize: 12, color: "#888", marginTop: 1 },
  soldBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#fdecea" },
  soldBtnText: { color: "#b3261e", fontSize: 12, fontWeight: "700" },
  soldRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, opacity: 0.6 },
  soldName: { flex: 1, fontSize: 14, color: "#666", textDecorationLine: "line-through" },
  soldTag: { fontSize: 11, fontWeight: "800", color: "#8a5a12", backgroundColor: "#f6efe6", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  hint: { fontSize: 12, color: "#999", marginTop: 8, lineHeight: 17 },
  limitCard: { backgroundColor: "#0f7a4d", borderColor: "#0a5c3a" },
  limitLabel: { fontSize: 12, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700" },
  limitVal: { fontSize: 34, fontWeight: "800", color: "#fff", marginVertical: 4 },
  limitSub: { fontSize: 12, color: "rgba(255,255,255,0.9)", lineHeight: 17 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLabel: { fontSize: 14, color: "#444" },
  rowVal: { fontSize: 14, color: "#222", fontWeight: "700", fontVariant: ["tabular-nums"] },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 6 },
  btnDim: { backgroundColor: "#b8c6bf" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  muted: { color: "#888", fontSize: 13, textAlign: "center", lineHeight: 19 },
  link: { marginTop: 8, padding: 10, alignItems: "center" },
  linkText: { color: "#2e7d32", fontSize: 14, fontWeight: "700" },
});
