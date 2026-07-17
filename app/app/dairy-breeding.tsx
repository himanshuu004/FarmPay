/**
 * Breeding — farmer-first data entry (FormKit): pick the female, choose AI vs
 * natural service, tap Today, big money pads for costs. Voice input stays on the
 * free-text fields (bull id, provider). Advanced bits under "More details".
 * Wired to POST /livestock/breeding.
 */
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import VoiceInputButton from "../components/VoiceInputButton";
import { apiGet, apiPost } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  FieldLabel, DateField, BigInput, ChoiceGrid, Chips, MoreDetails, Card, SaveButton, todayYMD,
} from "../components/FormKit";

type ServiceType = "AI" | "NATURAL_SERVICE";
type ProviderType = "GOVT_VET" | "PRIVATE_VET" | "COOP_INSEMINATOR" | "SELF";
type PayMode = "CASH" | "UPI" | "BANK" | "CREDIT";

const SERVICE_TYPES: { value: ServiceType; key: string; icon: string }[] = [
  { value: "AI",              key: "brd.svc.ai",      icon: "🧪" },
  { value: "NATURAL_SERVICE", key: "brd.svc.natural", icon: "🐂" },
];

export default function DairyBreeding() {
  const router = useRouter();
  const { t } = useI18n();
  const [animals, setAnimals] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [animalId, setAnimalId] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("AI");
  const [aiDate, setAiDate] = useState(todayYMD());
  const [bullCode, setBullCode] = useState("");
  const [breedUsed, setBreedUsed] = useState("");
  const [provider, setProvider] = useState("");
  const [providerType, setProviderType] = useState<ProviderType>("COOP_INSEMINATOR");
  const [serviceCharge, setServiceCharge] = useState("");
  const [transport, setTransport] = useState("");
  const [gratuity, setGratuity] = useState("");
  const [costFormal, setCostFormal] = useState("");
  const [costInformal, setCostInformal] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("CASH");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    (async () => {
      const res = await apiGet("/livestock/animals");
      if (res.success) setAnimals((res.data || []).filter((a: any) => a.gender === "FEMALE"));
    })();
  }, []);

  const save = async () => {
    if (!animalId) {
      Alert.alert(t("brd.select_animal"));
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        animalId,
        serviceType,
        aiDate,
        bullCode: bullCode || null,
        breedUsed: breedUsed || null,
        serviceProvider: provider || null,
        serviceProviderType: providerType,
        serviceCharge: serviceCharge ? parseFloat(serviceCharge) : 0,
        transportCost: transport ? parseFloat(transport) : 0,
        gratuityCost: gratuity ? parseFloat(gratuity) : 0,
        costFormal: costFormal ? parseFloat(costFormal) : 0,
        costInformal: costInformal ? parseFloat(costInformal) : 0,
        paymentMode: payMode,
        notes: notes || null,
      };
      const res = await apiPost("/livestock/breeding", body);
      if (res.success) {
        Alert.alert(t("common.saved"), t("brd.logged"), [
          { text: t("common.ok"), onPress: () => router.back() },
        ]);
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
        <FieldLabel en="Which animal?" hi="कौन सा पशु?" required />
        <Chips
          options={animals.map((a) => ({ value: a.animal_uuid, label: a.name || a.tag_number }))}
          value={animalId} onChange={setAnimalId}
        />
      </Card>

      <Card>
        <FieldLabel en="Service" hi="प्रजनन" />
        <ChoiceGrid options={SERVICE_TYPES.map((c) => ({ value: c.value, icon: c.icon, label: t(c.key) }))} value={serviceType} onChange={(v) => setServiceType(v as ServiceType)} />

        <FieldLabel en="When?" hi="कब?" />
        <DateField value={aiDate} onChange={setAiDate} />

        {serviceType === "AI" ? (
          <>
            <FieldLabel en="Bull code / semen" hi="सांड कोड" />
            <BigInput value={bullCode} onChangeText={setBullCode} placeholder="e.g. HF-2301" />
            <FieldLabel en="Breed used" hi="नस्ल" />
            <BigInput value={breedUsed} onChangeText={setBreedUsed} placeholder="e.g. HOLSTEIN_FRIESIAN" />
          </>
        ) : (
          <>
            <FieldLabel en="Bull id / owner" hi="सांड / मालिक" />
            <View style={s.voiceRow}>
              <View style={s.col}><BigInput value={bullCode} onChangeText={setBullCode} placeholder="Village bull / owner name" /></View>
              <VoiceInputButton onResult={setBullCode} language="hi" />
            </View>
          </>
        )}
      </Card>

      <Card>
        <FieldLabel en="Costs" hi="लागत" />
        <View style={s.two}>
          <View style={s.col}><Text style={s.mini}>{t("brd.service_charge")}</Text><BigInput value={serviceCharge} onChangeText={setServiceCharge} placeholder="250" numeric prefix="₹" /></View>
          <View style={s.col}><Text style={s.mini}>{t("brd.transport")}</Text><BigInput value={transport} onChangeText={setTransport} placeholder="50" numeric prefix="₹" /></View>
        </View>
        <FieldLabel en="Gratuity / tip" hi="इनाम" />
        <BigInput value={gratuity} onChangeText={setGratuity} placeholder="100" numeric prefix="₹" />
      </Card>

      <Card>
        <FieldLabel en="Service provider" hi="प्रदाता" />
        <View style={s.voiceRow}>
          <View style={s.col}><BigInput value={provider} onChangeText={setProvider} placeholder="e.g. KMF Cooperative" /></View>
          <VoiceInputButton onResult={setProvider} language="hi" />
        </View>

        <FieldLabel en="Provider type" hi="प्रकार" />
        <Chips
          options={(["GOVT_VET", "PRIVATE_VET", "COOP_INSEMINATOR", "SELF"] as ProviderType[]).map((p) => ({ value: p, label: t(`brd.ptype.${p.toLowerCase()}`) }))}
          value={providerType} onChange={setProviderType}
        />

        <MoreDetails>
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

      <SaveButton en="Save breeding" hi="सहेजें" onPress={save} saving={saving} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  two: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  mini: { fontSize: 12, color: "#999", marginTop: 8, marginBottom: 4, fontWeight: "600" },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
