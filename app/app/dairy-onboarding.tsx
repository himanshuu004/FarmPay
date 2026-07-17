/**
 * Dairy Onboarding — dairy activity profile (herd tier, cooperative, payment).
 * Farmer-first data entry (FormKit): tap a tier tile, tap payment mode,
 * cooperative details under "More details".
 * Wired to POST /livestock/profile (prefill: GET /livestock/profile).
 */
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { apiGet, apiPost } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  FieldLabel, BigInput, Stepper, ChoiceGrid, Chips, MoreDetails, Card, SaveButton,
} from "../components/FormKit";

type Tier = "SMALL" | "MEDIUM" | "LARGE";
type PayMode = "CASH" | "UPI" | "BANK" | "CREDIT";

export default function DairyOnboarding() {
  const router = useRouter();
  const { t } = useI18n();
  const TIERS: { value: Tier; label: string; icon: string }[] = [
    { value: "SMALL",  label: t("dairy.onb.tier_small"),  icon: "🐄" },
    { value: "MEDIUM", label: t("dairy.onb.tier_medium"), icon: "🐄🐄" },
    { value: "LARGE",  label: t("dairy.onb.tier_large"),  icon: "🐄🐄🐄" },
  ];

  const PAY_MODES: { value: PayMode; label: string }[] = [
    { value: "CASH", label: t("dairy.onb.pay_cash") },
    { value: "UPI",  label: t("dairy.onb.pay_upi")  },
    { value: "BANK", label: t("dairy.onb.pay_bank") },
    { value: "CREDIT", label: t("dairy.onb.pay_credit") },
  ];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tier, setTier] = useState<Tier>("SMALL");
  const [coopName, setCoopName] = useState("");
  const [coopMemberId, setCoopMemberId] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("CASH");
  const [expectedCount, setExpectedCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet("/livestock/profile");
        if (res.success && res.data) {
          const p = res.data;
          setTier((p.herd_tier || "SMALL") as Tier);
          setCoopName(p.cooperative_name || "");
          setCoopMemberId(p.cooperative_member_id || "");
          setPayMode((p.default_payment_mode || "CASH") as PayMode);
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: any = {
        herdTier: tier,
        cooperativeName: coopName || null,
        cooperativeMemberId: coopMemberId || null,
        defaultPaymentMode: payMode,
        currency: "INR",
      };
      if (expectedCount) body.expectedAnimalCount = expectedCount;
      const res = await apiPost("/livestock/profile", body);
      if (res.success) {
        Alert.alert(t("dairy.onb.saved_title"), t("dairy.onb.saved_msg"), [
          { text: t("dairy.onb.continue"), onPress: () => router.replace("/dairy-logbook" as any) },
        ]);
      } else {
        Alert.alert(t("common.error"), res.message || t("dairy.onb.save_failed"));
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || t("dairy.onb.network_error"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={s.header}>
        <Text style={s.headerEmoji}>🐄</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t("dairy.onb.title")}</Text>
          <Text style={s.headerSub}>{t("dairy.onb.subtitle")}</Text>
        </View>
      </View>

      <Card>
        <FieldLabel en="Herd size" hi="झुंड का आकार" />
        <ChoiceGrid options={TIERS} value={tier} onChange={(v) => setTier(v as Tier)} />
      </Card>

      <Card>
        <FieldLabel en="Default payment mode" hi="भुगतान विधि" />
        <Chips options={PAY_MODES} value={payMode} onChange={setPayMode} />
      </Card>

      <Card>
        <MoreDetails label={t("dairy.onb.coop_count")}>
          <FieldLabel en="Expected animal count" hi="पशु संख्या" />
          <Stepper value={expectedCount} onChange={setExpectedCount} min={0} max={500} />

          <FieldLabel en="Cooperative name" hi="सहकारी नाम" />
          <BigInput value={coopName} onChangeText={setCoopName} placeholder="e.g. KMF Bangalore Dairy Union" />

          <FieldLabel en="Member ID" hi="सदस्य आईडी" />
          <BigInput value={coopMemberId} onChangeText={setCoopMemberId} placeholder="e.g. KMF-BLR-44821" />
        </MoreDetails>
      </Card>

      <SaveButton en="Save & Continue" hi="सहेजें" onPress={save} saving={saving} />

      <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: "center", padding: 12 }}>
        <Text style={{ color: "#666", fontSize: 13 }}>{t("common.cancel")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f5f5f5" },
  header: { backgroundColor: "#1b5e20", borderRadius: 16, padding: 18, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerEmoji: { fontSize: 32 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  headerSub: { color: "#a5d6a7", fontSize: 13, marginTop: 2 },
});
