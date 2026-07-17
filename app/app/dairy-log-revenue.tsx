/**
 * Log revenue — farmer-first data entry (FormKit): tap a type, tap Today, big
 * number pads, auto-calc for milk (litres × rate), and optional fields (fat/SNF/
 * payer/notes) tucked under "More details". Wired to POST /livestock/revenue-events.
 */
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { apiGet, apiPost } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  FieldLabel, DateField, BigInput, ChoiceGrid, Chips, MoreDetails, Card, SaveButton, todayYMD,
} from "../components/FormKit";

type Category =
  | "MILK_SALE_COOP" | "MILK_SALE_DIRECT" | "ANIMAL_SALE"
  | "CALF_SALE" | "MANURE_SALE" | "INSURANCE_PAYOUT" | "SUBSIDY" | "OTHER";

const CATS: { value: Category; key: string; icon: string }[] = [
  { value: "MILK_SALE_COOP", key: "rev.cat.milk_coop", icon: "🥛" },
  { value: "MILK_SALE_DIRECT", key: "rev.cat.milk_direct", icon: "🏠" },
  { value: "ANIMAL_SALE", key: "rev.cat.animal", icon: "🐄" },
  { value: "CALF_SALE", key: "rev.cat.calf", icon: "🐂" },
  { value: "MANURE_SALE", key: "rev.cat.manure", icon: "♻️" },
  { value: "SUBSIDY", key: "rev.cat.subsidy", icon: "🏛️" },
  { value: "INSURANCE_PAYOUT", key: "rev.cat.insurance", icon: "🛡️" },
  { value: "OTHER", key: "rev.cat.other", icon: "📦" },
];

export default function DairyLogRevenue() {
  const router = useRouter();
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [animals, setAnimals] = useState<any[]>([]);

  const [category, setCategory] = useState<Category>("MILK_SALE_COOP");
  const [scope, setScope] = useState<"HERD" | "ANIMAL">("HERD");
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState(todayYMD());
  const [liters, setLiters] = useState("");
  const [fat, setFat] = useState("");
  const [snf, setSnf] = useState("");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const [notes, setNotes] = useState("");

  const isMilk = category === "MILK_SALE_COOP" || category === "MILK_SALE_DIRECT";

  useEffect(() => { (async () => { const res = await apiGet("/livestock/animals"); if (res.success) setAnimals(res.data || []); })(); }, []);

  // auto-calc amount for milk = litres × rate
  useEffect(() => {
    if (isMilk) { const l = parseFloat(liters), r = parseFloat(rate); if (!isNaN(l) && !isNaN(r)) setAmount((l * r).toFixed(2)); }
  }, [liters, rate, isMilk]);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert(t("common.enter_amount")); return; }
    if (scope === "ANIMAL" && !animalId) { Alert.alert(t("common.pick_animal")); return; }
    setSaving(true);
    try {
      const body: any = { eventDate, scope, category, amount: amt, payerName: payer || null, notes: notes || null };
      if (scope === "ANIMAL") body.animalId = animalId;
      if (isMilk) {
        if (liters) body.quantityLiters = parseFloat(liters);
        if (fat) body.fatPct = parseFloat(fat);
        if (snf) body.snfPct = parseFloat(snf);
        if (rate) body.ratePerLiter = parseFloat(rate);
      }
      const res = await apiPost("/livestock/revenue-events", body);
      if (res.success) Alert.alert(t("common.saved"), t("rev.recorded"), [{ text: t("common.done"), onPress: () => router.back() }]);
      else Alert.alert(t("common.not_saved"), res.message || t("common.try_again"));
    } catch (e: any) { Alert.alert(t("common.error"), t("common.offline_retry")); }
    finally { setSaving(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card>
        <FieldLabel en="What did you sell?" hi="आपने क्या बेचा?" />
        <ChoiceGrid options={CATS.map((c) => ({ value: c.value, icon: c.icon, label: t(c.key) }))} value={category} onChange={(v) => setCategory(v as Category)} />
      </Card>

      <Card>
        <FieldLabel en="When?" hi="कब?" />
        <DateField value={eventDate} onChange={setEventDate} />
      </Card>

      {isMilk ? (
        <Card>
          <FieldLabel en="Milk sold" hi="दूध बेचा" />
          <View style={s.two}>
            <View style={s.col}><Text style={s.mini}>{t("rev.litres")}</Text><BigInput value={liters} onChangeText={setLiters} placeholder="12" numeric suffix="L" /></View>
            <View style={s.col}><Text style={s.mini}>{t("rev.rate")}</Text><BigInput value={rate} onChangeText={setRate} placeholder="40" numeric prefix="₹" /></View>
          </View>
        </Card>
      ) : null}

      <Card>
        <FieldLabel en="Amount received" hi="मिली राशि" required />
        <BigInput value={amount} onChangeText={setAmount} placeholder="0" numeric prefix="₹" strong />
        {isMilk ? <Text style={s.mini}>{t("rev.auto_milk")}</Text> : null}

        <FieldLabel en="For" hi="किसके लिए" />
        <Chips
          options={[{ value: "HERD", label: t("common.whole_herd") }, { value: "ANIMAL", label: t("common.one_animal") }]}
          value={scope}
          onChange={(v) => { setScope(v as any); if (v === "HERD") setAnimalId(null); }}
        />
        {scope === "ANIMAL" ? (
          <View style={{ marginTop: 10 }}>
            <Chips options={animals.map((a) => ({ value: a.animal_uuid, label: a.name || a.tag_number }))} value={animalId} onChange={setAnimalId} />
          </View>
        ) : null}
      </Card>

      <Card>
        <MoreDetails>
          {isMilk ? (
            <View style={s.two}>
              <View style={s.col}><Text style={s.mini}>Fat %</Text><BigInput value={fat} onChangeText={setFat} placeholder="6.5" numeric /></View>
              <View style={s.col}><Text style={s.mini}>SNF %</Text><BigInput value={snf} onChangeText={setSnf} placeholder="9.0" numeric /></View>
            </View>
          ) : null}
          <FieldLabel en="Paid by" hi="किसने दिया" />
          <BigInput value={payer} onChangeText={setPayer} placeholder="e.g. Society / trader" />
          <FieldLabel en="Note" hi="टिप्पणी" />
          <BigInput value={notes} onChangeText={setNotes} placeholder="Optional" />
        </MoreDetails>
      </Card>

      <SaveButton en="Save earning" hi="सहेजें" onPress={save} saving={saving} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  two: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  mini: { fontSize: 12, color: "#999", marginTop: 8, marginBottom: 4, fontWeight: "600" },
});
