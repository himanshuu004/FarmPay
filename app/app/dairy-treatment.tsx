/**
 * Vet Treatment — farmer-first data entry (FormKit): pick the animal, tap the
 * treatment tile, tap Today, big money pads for costs. Advanced bits (vet
 * details, formal/informal split, payment, notes) live under "More details".
 * Wired to POST /livestock/treatment.
 */
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { apiGet, apiPost } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  FieldLabel, DateField, BigInput, ChoiceGrid, Chips, MoreDetails, Card, SaveButton, todayYMD,
} from "../components/FormKit";

type TreatmentType = "VACCINATION" | "DEWORMING" | "MASTITIS" | "FEVER" | "INJURY" | "REPRODUCTIVE" | "NUTRITIONAL" | "OTHER";
type VetType = "GOVT" | "PRIVATE" | "PARAVET" | "SELF";
type Outcome = "RECOVERED" | "IMPROVING" | "NO_CHANGE" | "WORSENED" | "DIED";
type PayMode = "CASH" | "UPI" | "BANK" | "CREDIT";

const TREATMENTS: { value: TreatmentType; key: string; icon: string }[] = [
  { value: "VACCINATION",  key: "trt.type.vaccine",      icon: "💉" },
  { value: "DEWORMING",    key: "trt.type.deworm",       icon: "🪱" },
  { value: "MASTITIS",     key: "trt.type.mastitis",     icon: "🩹" },
  { value: "FEVER",        key: "trt.type.fever",        icon: "🌡️" },
  { value: "INJURY",       key: "trt.type.injury",       icon: "🩸" },
  { value: "REPRODUCTIVE", key: "trt.type.reproductive", icon: "🤰" },
  { value: "NUTRITIONAL",  key: "trt.type.nutrition",    icon: "🥗" },
  { value: "OTHER",        key: "trt.type.other",        icon: "📦" },
];

const OUTCOMES: { value: Outcome; key: string }[] = [
  { value: "RECOVERED", key: "trt.outcome.recovered" },
  { value: "IMPROVING", key: "trt.outcome.improving" },
  { value: "NO_CHANGE", key: "trt.outcome.no_change" },
  { value: "WORSENED", key: "trt.outcome.worsened" },
  { value: "DIED", key: "trt.outcome.died" },
];

export default function DairyTreatment() {
  const router = useRouter();
  const { t } = useI18n();
  const [animals, setAnimals] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [animalId, setAnimalId] = useState<string | null>(null);
  const [treatmentDate, setTreatmentDate] = useState(todayYMD());
  const [treatmentType, setTreatmentType] = useState<TreatmentType>("OTHER");
  const [condition, setCondition] = useState("");
  const [vetName, setVetName] = useState("");
  const [vetType, setVetType] = useState<VetType>("PRIVATE");
  const [medicineCost, setMedicineCost] = useState("");
  const [vetFee, setVetFee] = useState("");
  const [otherCost, setOtherCost] = useState("");
  const [costFormal, setCostFormal] = useState("");
  const [costInformal, setCostInformal] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("CASH");
  const [outcome, setOutcome] = useState<Outcome>("IMPROVING");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      const res = await apiGet("/livestock/animals");
      if (res.success) setAnimals(res.data || []);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: any = {
        animalId,
        treatmentDate,
        treatmentType,
        condition: condition || null,
        vetName: vetName || null,
        vetType,
        medicineCost: medicineCost ? parseFloat(medicineCost) : 0,
        vetFee: vetFee ? parseFloat(vetFee) : 0,
        otherCost: otherCost ? parseFloat(otherCost) : 0,
        costFormal: costFormal ? parseFloat(costFormal) : 0,
        costInformal: costInformal ? parseFloat(costInformal) : 0,
        paymentMode: payMode,
        outcome,
        notes: notes || null,
      };
      const res = await apiPost("/livestock/treatment", body);
      if (res.success) {
        Alert.alert(t("common.saved"), t("trt.logged"), [{ text: t("common.ok"), onPress: () => router.back() }]);
      } else {
        Alert.alert(t("common.error"), res.message || t("common.try_again"));
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || t("common.offline_retry"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <FieldLabel en="Which animal?" hi="कौन सा पशु?" />
        <Chips
          options={[
            { value: "__HERD__", label: t("trt.herd_wide") },
            ...animals.map((a) => ({ value: a.animal_uuid, label: a.name || a.tag_number })),
          ]}
          value={animalId ?? "__HERD__"}
          onChange={(v) => setAnimalId(v === "__HERD__" ? null : v)}
        />
      </Card>

      <Card>
        <FieldLabel en="Treatment" hi="इलाज" />
        <ChoiceGrid options={TREATMENTS.map((c) => ({ value: c.value, icon: c.icon, label: t(c.key) }))} value={treatmentType} onChange={(v) => setTreatmentType(v as TreatmentType)} />
      </Card>

      <Card>
        <FieldLabel en="When?" hi="कब?" />
        <DateField value={treatmentDate} onChange={setTreatmentDate} />
      </Card>

      <Card>
        <FieldLabel en="Costs" hi="लागत" />
        <View style={s.two}>
          <View style={s.col}><Text style={s.mini}>{t("trt.medicine")}</Text><BigInput value={medicineCost} onChangeText={setMedicineCost} placeholder="420" numeric prefix="₹" /></View>
          <View style={s.col}><Text style={s.mini}>{t("trt.vet_fee")}</Text><BigInput value={vetFee} onChangeText={setVetFee} placeholder="300" numeric prefix="₹" /></View>
        </View>
        <FieldLabel en="Other cost" hi="अन्य" />
        <BigInput value={otherCost} onChangeText={setOtherCost} placeholder="50" numeric prefix="₹" />

        <FieldLabel en="How did it go?" hi="नतीजा" />
        <Chips options={OUTCOMES.map((o) => ({ value: o.value, label: t(o.key) }))} value={outcome} onChange={setOutcome} />
      </Card>

      <Card>
        <FieldLabel en="Illness / condition" hi="बीमारी" />
        <BigInput value={condition} onChangeText={setCondition} placeholder="e.g. Mild mastitis" />

        <MoreDetails>
          <FieldLabel en="Vet name" hi="डॉक्टर का नाम" />
          <BigInput value={vetName} onChangeText={setVetName} placeholder="e.g. Dr Basavaraj" />

          <FieldLabel en="Vet type" hi="प्रकार" />
          <Chips
            options={(["GOVT", "PRIVATE", "PARAVET", "SELF"] as VetType[]).map((v) => ({ value: v, label: t(`trt.vettype.${v.toLowerCase()}`) }))}
            value={vetType} onChange={setVetType}
          />

          <FieldLabel en="How paid?" hi="कैसे चुकाया" />
          <Chips options={(["CASH", "UPI", "BANK", "CREDIT"] as PayMode[]).map((m) => ({ value: m, label: t(`cost.pay.${m.toLowerCase()}`) }))} value={payMode} onChange={setPayMode} />

          <Text style={s.mini}>{t("trt.formal_informal")}</Text>
          <View style={s.two}>
            <View style={s.col}><Text style={s.mini}>{t("cost.formal")}</Text><BigInput value={costFormal} onChangeText={setCostFormal} placeholder="0" numeric /></View>
            <View style={s.col}><Text style={s.mini}>{t("cost.informal")}</Text><BigInput value={costInformal} onChangeText={setCostInformal} placeholder="0" numeric /></View>
          </View>

          <FieldLabel en="Note" hi="टिप्पणी" />
          <BigInput value={notes} onChangeText={setNotes} placeholder="Optional" />
        </MoreDetails>
      </Card>

      <SaveButton en="Save treatment" hi="सहेजें" onPress={save} saving={saving} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  two: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  mini: { fontSize: 12, color: "#999", marginTop: 8, marginBottom: 4, fontWeight: "600" },
});
