/**
 * Log expense — farmer-first data entry (FormKit): tap a category, tap Today,
 * big number pads, auto-calc (quantity × price), and the advanced bits
 * (formal/informal split, vendor, note) under "More details".
 * Wired to POST /livestock/cost-events.
 */
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { apiGet, apiPost } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  FieldLabel, DateField, BigInput, ChoiceGrid, Chips, MoreDetails, Card, SaveButton, todayYMD,
} from "../components/FormKit";

type Category =
  | "FEED" | "FODDER" | "MEDICINE" | "VET_TREATMENT" | "VACCINATION"
  | "LABOR" | "ELECTRICITY" | "WATER" | "HOUSING" | "EQUIPMENT"
  | "TRANSPORT" | "INSURANCE" | "OTHER";
type PayMode = "CASH" | "UPI" | "BANK" | "CREDIT";

const CATEGORIES: { value: Category; key: string; icon: string }[] = [
  { value: "FEED", key: "cost.cat.feed", icon: "🌾" },
  { value: "FODDER", key: "cost.cat.fodder", icon: "🌿" },
  { value: "LABOR", key: "cost.cat.labour", icon: "👷" },
  { value: "MEDICINE", key: "cost.cat.medicine", icon: "💊" },
  { value: "VET_TREATMENT", key: "cost.cat.vet", icon: "💉" },
  { value: "VACCINATION", key: "cost.cat.vaccine", icon: "🩹" },
  { value: "ELECTRICITY", key: "cost.cat.electric", icon: "⚡" },
  { value: "WATER", key: "cost.cat.water", icon: "💧" },
  { value: "TRANSPORT", key: "cost.cat.transport", icon: "🚚" },
  { value: "EQUIPMENT", key: "cost.cat.equipment", icon: "🔧" },
  { value: "OTHER", key: "cost.cat.other", icon: "📦" },
];

export default function DairyLogCost() {
  const router = useRouter();
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [animals, setAnimals] = useState<any[]>([]);

  const [category, setCategory] = useState<Category>("FEED");
  const [scope, setScope] = useState<"HERD" | "ANIMAL">("HERD");
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState(todayYMD());
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [amountFormal, setAmountFormal] = useState("");
  const [amountInformal, setAmountInformal] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("CASH");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { (async () => { const res = await apiGet("/livestock/animals"); if (res.success) setAnimals(res.data || []); })(); }, []);

  useEffect(() => {
    const q = parseFloat(quantity), p = parseFloat(unitPrice);
    if (!isNaN(q) && !isNaN(p)) setAmount((q * p).toFixed(2));
  }, [quantity, unitPrice]);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert(t("common.enter_amount")); return; }
    if (scope === "ANIMAL" && !animalId) { Alert.alert(t("common.pick_animal")); return; }
    setSaving(true);
    try {
      const body: any = {
        eventDate, scope, category, amount: amt,
        amountFormal: amountFormal ? parseFloat(amountFormal) : amt,
        amountInformal: amountInformal ? parseFloat(amountInformal) : 0,
        paymentMode: payMode, vendorName: vendor || null, notes: notes || null,
      };
      if (scope === "ANIMAL") body.animalId = animalId;
      if (quantity) body.quantity = parseFloat(quantity);
      if (unit) body.unit = unit;
      if (unitPrice) body.unitPrice = parseFloat(unitPrice);
      const res = await apiPost("/livestock/cost-events", body);
      if (res.success) Alert.alert(t("common.saved"), t("cost.recorded"), [{ text: t("common.done"), onPress: () => router.back() }]);
      else Alert.alert(t("common.not_saved"), res.message || t("common.try_again"));
    } catch (e: any) { Alert.alert(t("common.error"), t("common.offline_retry")); }
    finally { setSaving(false); }
  };

  const UNITS = ["kg", "bag", "litre", "piece", "hour"];

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <FieldLabel en="What did you spend on?" hi="किस पर खर्च?" />
        <ChoiceGrid options={CATEGORIES.map((c) => ({ value: c.value, icon: c.icon, label: t(c.key) }))} value={category} onChange={(v) => setCategory(v as Category)} />
      </Card>

      <Card>
        <FieldLabel en="When?" hi="कब?" />
        <DateField value={eventDate} onChange={setEventDate} />
      </Card>

      <Card>
        <FieldLabel en="How much?" hi="कितना?" />
        <View style={s.two}>
          <View style={s.col}><Text style={s.mini}>{t("cost.quantity")}</Text><BigInput value={quantity} onChangeText={setQuantity} placeholder="12" numeric /></View>
          <View style={s.col}><Text style={s.mini}>{t("cost.price_unit")}</Text><BigInput value={unitPrice} onChangeText={setUnitPrice} placeholder="32" numeric prefix="₹" /></View>
        </View>
        <View style={{ marginTop: 8 }}>
          <Chips options={UNITS.map((u) => ({ value: u, label: t(`cost.unit.${u}`) }))} value={unit} onChange={setUnit} />
        </View>

        <FieldLabel en="Total spent" hi="कुल खर्च" required />
        <BigInput value={amount} onChangeText={setAmount} placeholder="0" numeric prefix="₹" strong />
        <Text style={s.mini}>{t("cost.auto_qty")}</Text>

        <FieldLabel en="For" hi="किसके लिए" />
        <Chips
          options={[{ value: "HERD", label: t("common.whole_herd") }, { value: "ANIMAL", label: t("common.one_animal") }]}
          value={scope} onChange={(v) => { setScope(v as any); if (v === "HERD") setAnimalId(null); }}
        />
        {scope === "ANIMAL" ? (
          <View style={{ marginTop: 10 }}>
            <Chips options={animals.map((a) => ({ value: a.animal_uuid, label: a.name || a.tag_number }))} value={animalId} onChange={setAnimalId} />
          </View>
        ) : null}
      </Card>

      <Card>
        <FieldLabel en="How paid?" hi="कैसे चुकाया" />
        <Chips options={(["CASH", "UPI", "BANK", "CREDIT"] as PayMode[]).map((m) => ({ value: m, label: t(`cost.pay.${m.toLowerCase()}`) }))} value={payMode} onChange={setPayMode} />
        <MoreDetails>
          <Text style={s.mini}>{t("cost.formal_informal")}</Text>
          <View style={s.two}>
            <View style={s.col}><Text style={s.mini}>{t("cost.formal")}</Text><BigInput value={amountFormal} onChangeText={setAmountFormal} placeholder="0" numeric /></View>
            <View style={s.col}><Text style={s.mini}>{t("cost.informal")}</Text><BigInput value={amountInformal} onChangeText={setAmountInformal} placeholder="0" numeric /></View>
          </View>
          <FieldLabel en="Shop / vendor" hi="दुकान" />
          <BigInput value={vendor} onChangeText={setVendor} placeholder="e.g. local agri store" />
          <FieldLabel en="Note" hi="टिप्पणी" />
          <BigInput value={notes} onChangeText={setNotes} placeholder="Optional" />
        </MoreDetails>
      </Card>

      <SaveButton en="Save expense" hi="सहेजें" onPress={save} saving={saving} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  two: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  mini: { fontSize: 12, color: "#999", marginTop: 8, marginBottom: 4, fontWeight: "600" },
});
