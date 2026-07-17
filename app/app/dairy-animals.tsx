import { useState, useEffect, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost, formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";

type Species = "CATTLE" | "BUFFALO" | "GOAT" | "SHEEP" | "PIG" | "POULTRY";

// Shared livestock register — dairy is full-featured; goat/sheep/pig/poultry
// reuse the same register + cost/revenue logbook + P&L (CLAUDE.md v1 scope).
const SPECIES_META: Record<Species, { emoji: string }> = {
  CATTLE: { emoji: "🐄" },
  BUFFALO: { emoji: "🐃" },
  GOAT: { emoji: "🐐" },
  SHEEP: { emoji: "🐑" },
  PIG: { emoji: "🐖" },
  POULTRY: { emoji: "🐔" },
};
const SPECIES_ORDER = Object.keys(SPECIES_META) as Species[];
type Gender = "FEMALE" | "MALE";
type Lifecycle = "CALF" | "HEIFER" | "DRY" | "EARLY_LACTATION" | "PEAK_LACTATION" | "LATE_LACTATION" | "PREGNANT" | "BREEDING";

const LIFECYCLES: Lifecycle[] = [
  "CALF", "HEIFER", "DRY", "EARLY_LACTATION", "PEAK_LACTATION", "LATE_LACTATION", "PREGNANT", "BREEDING",
];

export default function DairyAnimals() {
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [animals, setAnimals] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const params = useLocalSearchParams<{ species?: string }>();
  const initSpecies: Species = SPECIES_ORDER.includes(params.species as Species) ? (params.species as Species) : "CATTLE";
  const [species, setSpecies] = useState<Species>(initSpecies);
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState<Gender>("FEMALE");
  const [dob, setDob] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [lifecycle, setLifecycle] = useState<Lifecycle>("HEIFER");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet("/livestock/animals");
      if (res.success) setAnimals(res.data || []);
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resetForm = () => {
    setTag(""); setName(""); setSpecies(initSpecies); setBreed("");
    setGender("FEMALE"); setDob(""); setPurchaseCost(""); setPurchaseDate("");
    setLifecycle("HEIFER");
  };

  const save = async () => {
    if (!name.trim() && !tag.trim()) {
      Alert.alert(t("dairy.animals.missing_title"), t("dairy.animals.missing_msg"));
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        tagNumber: tag || null,
        name: name || null,
        species,
        breedCode: breed || null,
        gender,
        dateOfBirth: dob || null,
        purchaseDate: purchaseDate || null,
        purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
        // Lifecycle stages (calf/heifer/lactation) are dairy-specific — omit for other species.
        lifecycleStage: (species === "CATTLE" || species === "BUFFALO") ? lifecycle : null,
        acquisitionMode: "PURCHASED",
        paymentMode: "CASH",
      };
      const res = await apiPost("/livestock/animals", body);
      if (res.success) {
        Alert.alert(t("dairy.animals.added_title"), t("dairy.animals.added_msg"));
        resetForm();
        setShowForm(false);
        load();
      } else {
        Alert.alert(t("common.error"), res.message || t("dairy.animals.add_failed"));
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || t("dairy.onb.network_error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t("dairy.animals.title")}</Text>
      </View>

      {!showForm && (
        <TouchableOpacity style={s.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
          <Text style={s.addBtnText}>{t("dairy.animals.add")}</Text>
        </TouchableOpacity>
      )}

      {showForm && (
        <View style={s.card}>
          <Text style={s.cardLabel}>{t("dairy.animals.new")}</Text>

          <Text style={s.fieldLabel}>{t("dairy.animals.tag")}</Text>
          <TextInput style={s.input} value={tag} onChangeText={setTag} placeholder="e.g., RG-001" autoCapitalize="characters" />

          <Text style={s.fieldLabel}>{t("dairy.animals.name")}</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g., Ganga" />

          <Text style={s.fieldLabel}>{t("dairy.animals.species")}</Text>
          <View style={s.chipRow}>
            {SPECIES_ORDER.map((v) => (
              <TouchableOpacity key={v} style={[s.chip, species === v && s.chipSel]} onPress={() => setSpecies(v)}>
                <Text style={[s.chipText, species === v && s.chipTextSel]}>{SPECIES_META[v].emoji} {t(`dairy.species.${v}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>{t("dairy.animals.breed")}</Text>
          <TextInput style={s.input} value={breed} onChangeText={setBreed} placeholder="e.g., HF_CROSS, MURRAH" autoCapitalize="characters" />

          <Text style={s.fieldLabel}>{t("dairy.animals.gender")}</Text>
          <View style={s.chipRow}>
            {(["FEMALE", "MALE"] as Gender[]).map((v) => (
              <TouchableOpacity key={v} style={[s.chip, gender === v && s.chipSel]} onPress={() => setGender(v)}>
                <Text style={[s.chipText, gender === v && s.chipTextSel]}>{t(`dairy.gender.${v}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>{t("dairy.animals.dob")}</Text>
          <TextInput style={s.input} value={dob} onChangeText={setDob} placeholder="2022-03-15" />

          <Text style={s.fieldLabel}>{t("dairy.animals.lifecycle")}</Text>
          <View style={s.chipRow}>
            {LIFECYCLES.map((l) => (
              <TouchableOpacity key={l} style={[s.chipSmall, lifecycle === l && s.chipSel]} onPress={() => setLifecycle(l)}>
                <Text style={[s.chipTextSmall, lifecycle === l && s.chipTextSel]}>{t(`dairy.lc.${l}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>{t("dairy.animals.purchase_cost")}</Text>
          <TextInput style={s.input} value={purchaseCost} onChangeText={setPurchaseCost} placeholder="65000" keyboardType="numeric" />

          <Text style={s.fieldLabel}>{t("dairy.animals.purchase_date")}</Text>
          <TextInput style={s.input} value={purchaseDate} onChangeText={setPurchaseDate} placeholder="2024-08-10" />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowForm(false); resetForm(); }}>
              <Text style={s.cancelBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={save}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{t("dairy.animals.save")}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {animals.length === 0 && !showForm ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>🐄</Text>
          <Text style={s.emptyText}>{t("dairy.animals.empty")}</Text>
        </View>
      ) : (
        animals.map((a) => (
          <View key={a.animal_uuid} style={s.animalCard}>
            <Text style={s.animalEmoji}>{SPECIES_META[a.species as Species]?.emoji ?? "🐄"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.animalName}>{a.name || a.tag_number || t("dairy.animals.unnamed")}</Text>
              <Text style={s.animalMeta}>
                {a.tag_number ? `#${a.tag_number} · ` : ""}
                {a.breed_code || a.species} · {a.current_lifecycle_stage?.replace(/_/g, " ")}
              </Text>
              {a.purchase_cost && (
                <Text style={s.animalCost}>{t("dairy.animals.bought")}: {formatRupees(a.purchase_cost)}</Text>
              )}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f5f5f5" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  back: { fontSize: 28, color: "#1b5e20", fontWeight: "700" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1b5e20" },
  addBtn: { backgroundColor: "#2e7d32", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 16 },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#555", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fafafa" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1.5, borderColor: "#ddd", backgroundColor: "#fafafa" },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fafafa" },
  chipSel: { borderColor: "#2e7d32", backgroundColor: "#e8f5e9" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#666" },
  chipTextSmall: { fontSize: 11, fontWeight: "600", color: "#666" },
  chipTextSel: { color: "#1b5e20" },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1.5, borderColor: "#ddd" },
  cancelBtnText: { color: "#666", fontWeight: "700", fontSize: 14 },
  saveBtn: { flex: 2, backgroundColor: "#2e7d32", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty: { alignItems: "center", padding: 30 },
  emptyEmoji: { fontSize: 56, marginBottom: 10 },
  emptyText: { fontSize: 16, fontWeight: "700", color: "#666" },
  emptySub: { fontSize: 13, color: "#999", marginTop: 2 },
  animalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  animalEmoji: { fontSize: 32 },
  animalName: { fontSize: 15, fontWeight: "700", color: "#333" },
  animalMeta: { fontSize: 11, color: "#888", marginTop: 2 },
  animalCost: { fontSize: 11, color: "#2e7d32", marginTop: 2, fontWeight: "600" },
});
