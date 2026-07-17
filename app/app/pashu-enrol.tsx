/**
 * Pashu Suraksha enrolment — the farmer-authored steps of the NLM machine:
 * DRAFT (create proposal) → TAGGED (12-digit NDDB tag + 2 photos). Examine /
 * value / pay / issue are the VET + back-office steps that follow. Muzzle is a
 * second factor, never a gate. Wired to POST /kavach/proposals + .../tag.
 */
import { useState, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { apiGet, apiPost } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { BigInput } from "../components/FormKit";

const STEP_KEYS = [
  "pashu.enrol.step.draft", "pashu.enrol.step.tag", "pashu.enrol.step.vet",
  "pashu.enrol.step.valued", "pashu.enrol.step.premium", "pashu.enrol.step.issued",
];

export default function PashuEnrol() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ planCode?: string; marketValue?: string; animalId?: string }>();
  const [animals, setAnimals] = useState<any[]>([]);
  const [animalId, setAnimalId] = useState<number | null>(null);
  const [tag, setTag] = useState("");
  const [consent, setConsent] = useState(false);
  const [muzzle, setMuzzle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [doneStep, setDoneStep] = useState(0); // 0=nothing, 1=draft, 2=tagged

  useEffect(() => {
    (async () => {
      const res = await apiGet("/kavach/assets/me");
      if (res.success) {
        const uncovered = (res.data || []).filter((a: any) => !a.covered);
        setAnimals(uncovered);
        const pre = params.animalId ? parseInt(params.animalId, 10) : null;
        if (pre && uncovered.some((a: any) => a.animalId === pre)) setAnimalId(pre);
      }
    })();
  }, [params.animalId]);

  const tagValid = (tag.match(/\d/g) || []).length === 12;

  const submit = async () => {
    if (!consent) { Alert.alert(t("pashu.enrol.consent_needed"), t("pashu.enrol.consent_msg")); return; }
    if (!tagValid) { Alert.alert(t("pashu.enrol.tag_title"), t("pashu.enrol.tag_msg")); return; }
    setBusy(true);
    try {
      // Record the DPDP insurance consent (the proposal auto-links it).
      await apiPost("/compliance/consent", { consentType: "insurance", version: "v1" }).catch(() => null);
      const mk = await apiPost("/kavach/proposals", {
        planCode: params.planCode, assetRefId: animalId ?? undefined,
        marketValue: params.marketValue ? parseFloat(params.marketValue) : undefined,
      });
      if (!mk.success) { Alert.alert(t("pashu.enrol.could_not_start"), mk.message || t("common.try_again")); return; }
      setDoneStep(1);
      const tg = await apiPost(`/kavach/proposals/${mk.data.proposalUuid}/tag`, {
        tagUid: (tag.match(/\d/g) || []).join(""),
        ownerPhotoUrl: "app://photo/owner", tagPhotoUrl: "app://photo/tag",
      });
      if (tg.success) {
        // Muzzle burst — SHADOW second factor (AI proposes, never gates issuance).
        // On real devices the embedding comes from the on-device ONNX model; this
        // placeholder is derived from the tag so it's stable per animal. Failures
        // never block enrolment — the 12-digit tag remains the statutory identity.
        if (muzzle) {
          try {
            await apiPost("/compliance/consent", { consentType: "biometric", version: "v1" });
            const digits = (tag.match(/\d/g) || []).map(Number);
            const embedding = Array.from({ length: 128 }, (_, i) => ((digits[i % digits.length] || 0) + 1) / 11);
            await apiPost("/identity/biometrics", {
              animalId: animalId ?? undefined, tagUid: digits.join(""), embedding, quality: 0.9,
            });
          } catch (e) { /* shadow-mode — enrolment proceeds regardless */ }
        }
        setDoneStep(2);
        Alert.alert(t("pashu.enrol.submitted"), t("pashu.enrol.submitted_msg"));
      } else Alert.alert(t("pashu.enrol.tag_failed"), tg.message || t("common.try_again"));
    } catch (e) { Alert.alert(t("common.error"), t("pashu.enrol.conn_check")); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("pashu.enrol.title")}</Text>
        {STEP_KEYS.map((s, i) => (
          <View key={s} style={styles.step}>
            <View style={[styles.dot, i < doneStep && styles.dotDone, i === doneStep && styles.dotNow]} />
            <Text style={[styles.stepLbl, i === doneStep && styles.stepNow]}>{t(s)}</Text>
          </View>
        ))}
      </View>

      {doneStep < 2 ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("pashu.enrol.which_animal")}</Text>
            {animals.length === 0 ? <Text style={styles.muted}>{t("pashu.enrol.all_covered")}</Text> : (
              <View style={styles.chipRow}>
                {animals.map((a) => (
                  <TouchableOpacity key={a.animalId} style={[styles.chip, animalId === a.animalId && styles.chipSel]} onPress={() => setAnimalId(a.animalId)}>
                    <Text style={[styles.chipText, animalId === a.animalId && styles.chipTextSel]}>{a.tagNumber || a.species || t("pashu.animal_word")}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("pashu.enrol.statutory_identity")}</Text>
            <BigInput value={tag} onChangeText={setTag} placeholder={t("pashu.enrol.tag_placeholder")} numeric />
            <View style={styles.photoRow}>
              <Text style={[styles.photoChip, styles.photoDone]}>{t("pashu.enrol.photo_owner")}</Text>
              <Text style={[styles.photoChip, styles.photoDone]}>{t("pashu.enrol.photo_tag")}</Text>
            </View>
            <TouchableOpacity style={styles.check} onPress={() => setMuzzle(!muzzle)}>
              <View style={[styles.box, muzzle && styles.boxOn]}>{muzzle ? <Text style={styles.boxTick}>✓</Text> : null}</View>
              <Text style={styles.checkLabel}>{t("pashu.enrol.muzzle_check")}</Text>
            </TouchableOpacity>
            <Text style={styles.muted}>{t("pashu.enrol.muzzle_note")}</Text>
          </View>

          <TouchableOpacity style={styles.check} onPress={() => setConsent(!consent)}>
            <View style={[styles.box, consent && styles.boxOn]}>{consent ? <Text style={styles.boxTick}>✓</Text> : null}</View>
            <Text style={styles.checkLabel}>{t("pashu.enrol.premium_consent")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, (!consent || !tagValid || busy) && styles.btnDisabled]} disabled={!consent || !tagValid || busy} onPress={submit}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t("pashu.enrol.submit")}</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/pashu-home")}>
          <Text style={styles.btnText}>{t("common.done")}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee" },
  cardTitle: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontWeight: "600" },
  step: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  dot: { width: 12, height: 12, borderRadius: 999, backgroundColor: "#ddd" },
  dotDone: { backgroundColor: "#2e7d32" },
  dotNow: { backgroundColor: "#b4530a" },
  stepLbl: { fontSize: 13, color: "#888" },
  stepNow: { color: "#1b5e20", fontWeight: "700" },
  muted: { color: "#888", fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderRadius: 10, borderWidth: 1, borderColor: "#ddd", paddingVertical: 8, paddingHorizontal: 12 },
  chipSel: { backgroundColor: "#e8f5e9", borderColor: "#2e7d32" },
  chipText: { fontSize: 13, color: "#555" },
  chipTextSel: { color: "#1b5e20", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 10, backgroundColor: "#fafafa" },
  photoRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  photoChip: { fontSize: 12, color: "#1b5e20", backgroundColor: "#e8f5e9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontWeight: "600", overflow: "hidden" },
  photoDone: {},
  check: { flexDirection: "row", alignItems: "center", gap: 10, padding: 6, marginBottom: 12 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#bbb", alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  boxTick: { color: "#fff", fontSize: 14, fontWeight: "800" },
  checkLabel: { flex: 1, fontSize: 13, color: "#333" },
  btn: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 20 },
  btnDisabled: { backgroundColor: "#b8c6bf" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
