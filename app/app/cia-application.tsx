/**
 * CIA — application form + document checklist. The row already exists from EOI and
 * becomes fillable after DCS selection; this screen merges ERP pre-fill, the farmer's
 * requested cattle count / breed, and camera-captured documents, then submits
 * (mandatory-gated → PENDING_SUPERVISOR_VERIFY).
 *
 * Wired to POST /applications (open/patch), .../documents (upload), .../submit.
 * Camera-only capture; a real SHA-256 of the bytes + S3 upload are a follow-up
 * (the backend stores the client-supplied ref/hash today).
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useI18n } from "../lib/i18n";
import { useContentMax } from "../lib/responsive";
import { FieldLabel, Stepper, BigInput, SaveButton } from "../components/FormKit";
import { openDraft, uploadDoc, submitApplication, placeholderHash, CiaDraft, CiaDoc } from "../lib/ciaApi";

const DOC_ICON: Record<string, string> = {
  aadhaar: "🪪", bank_passbook: "🏦", photo: "🧑", caste_cert: "📜", land_shed: "🏠",
};

export default function CiaApplication() {
  const router = useRouter();
  const { t } = useI18n();
  const cmax = useContentMax();
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<CiaDraft | null>(null);
  const [notFillable, setNotFillable] = useState(false);
  const [count, setCount] = useState(1);
  const [breed, setBreed] = useState("");
  const [captured, setCaptured] = useState<Record<string, boolean>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setNotFillable(false);
    const r = await openDraft();
    if (r.ok && r.data) {
      const d = r.data;
      setDraft(d);
      setCount(d.requestedCattleCount || 1);
      setBreed(d.preferredBreed || "");
      setCaptured(Object.fromEntries((d.documents?.captured || []).map((k) => [k, true])));
      setMissing(d.documents?.missingMandatory || []);
    } else if (r.errorCode === "CIA_NO_FILLABLE_APP") {
      setNotFillable(true);
    }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const captureDoc = useCallback(async (key: string) => {
    if (!draft) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert(t("cia.app.camera_denied")); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, exif: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const contentHash = placeholderHash(asset.uri + String(asset.fileSize ?? asset.width ?? ""));
    const r = await uploadDoc(draft.applicationUuid, {
      checklistKey: key,
      docRef: asset.uri,
      contentHash,
      mimeType: asset.mimeType || "image/jpeg",
      captureMeta: { width: asset.width, height: asset.height, exif: asset.exif ?? null },
    });
    if (r.ok) {
      setCaptured((p) => ({ ...p, [key]: true }));
      if (r.missingMandatory) setMissing(r.missingMandatory);
    } else {
      Alert.alert(r.message || t("cia.load_error"));
    }
  }, [draft, t]);

  const saveDraft = useCallback(async () => {
    setSaving(true);
    await openDraft({ requestedCattleCount: count, preferredBreed: breed || undefined });
    setSaving(false);
    Alert.alert(t("cia.app.saved"));
  }, [count, breed, t]);

  const submit = useCallback(async () => {
    if (!draft) return;
    setSubmitting(true);
    await openDraft({ requestedCattleCount: count, preferredBreed: breed || undefined }); // persist first
    const r = await submitApplication(draft.applicationUuid);
    setSubmitting(false);
    if (r.ok) setSubmitted(true);
    else if (r.missingMandatory) { setMissing(r.missingMandatory); Alert.alert(t("cia.app.capture_first")); }
    else Alert.alert(r.message || t("cia.load_error"));
  }, [draft, count, breed, t]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  if (notFillable) {
    return <View style={styles.center}><Text style={styles.notice}>{t("cia.app.not_selected")}</Text></View>;
  }
  if (!draft) return <View style={styles.center}><Text style={styles.muted}>{t("cia.load_error")}</Text></View>;

  if (submitted) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.successBody, cmax]}>
        <Text style={styles.art}>✅</Text>
        <Text style={styles.h}>{t("cia.app.submitted")}</Text>
        <Text style={styles.p}>{t("cia.app.submitted_sub")}</Text>
        <TouchableOpacity style={styles.big} onPress={() => router.replace("/cia-status")}>
          <Text style={styles.bigTxt}>{t("cia.eoi.track")}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const p = draft.prefill;
  const checklist: CiaDoc[] = draft.documentChecklist || [];
  const mandatory = checklist.filter((d) => (d.required || "MANDATORY") === "MANDATORY");
  const gotMandatory = mandatory.filter((d) => captured[d.key]).length;
  const canSubmit = missing.length === 0 && mandatory.length > 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, cmax]}>
      {/* ERP pre-fill (read-only) */}
      <Text style={styles.section}>{t("cia.app.applicant")}</Text>
      <View style={styles.prefill}>
        <Prefill label={t("cia.app.applicant").split(" (")[0]} value={p?.name || "—"} t={t} />
        <Prefill label={t("cia.app.mobile")} value={p?.mobile || "—"} t={t} />
        <Prefill label={t("cia.app.society")} value={p?.dcsRef || draft.schemeVersion} t={t} />
        <Prefill label={t("cia.app.bank")} value={p?.bankAccount || "—"} t={t} last />
      </View>

      <FieldLabel en={t("cia.app.how_many")} />
      <Stepper value={count} onChange={setCount} min={1} max={10} />

      <View style={{ height: 14 }} />
      <FieldLabel en={t("cia.app.breed")} />
      <BigInput value={breed} onChangeText={setBreed} placeholder={t("cia.app.breed_ph")} />

      {/* Documents */}
      <Text style={[styles.section, { marginTop: 18 }]}>{t("cia.app.documents")}</Text>
      {Platform.OS === "web" ? (
        <View style={styles.webNote}><Text style={styles.webNoteTxt}>🖥️ {t("cia.web_capture_note")}</Text></View>
      ) : null}
      {checklist.map((d) => {
        const done = !!captured[d.key];
        const mand = (d.required || "MANDATORY") === "MANDATORY";
        return (
          <View key={d.key} style={[styles.doc, done && styles.docDone]}>
            <Text style={styles.docIc}>{done ? "✅" : (DOC_ICON[d.key] || "📄")}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.docLabel}>{d.label}</Text>
              <Text style={done ? styles.docCaptured : (mand ? styles.docReq : styles.docOpt)}>
                {done ? t("cia.app.captured") : (mand ? t("cia.app.required") : t("cia.app.optional"))}
              </Text>
            </View>
            <TouchableOpacity style={[styles.cap, done && styles.capRe]} onPress={() => captureDoc(d.key)}>
              <Text style={[styles.capTxt, done && styles.capReTxt]}>📷 {done ? t("cia.app.retake") : t("cia.app.capture")}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      <Text style={styles.progress}>{gotMandatory} {t("cia.app.of")} {mandatory.length} {t("cia.app.n_of_m")}</Text>

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.ghost} onPress={saveDraft} disabled={saving}>
          {saving ? <ActivityIndicator color="#1b5e20" /> : <Text style={styles.ghostTxt}>{t("cia.app.save_draft")}</Text>}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <SaveButton en={t("cia.app.submit")} onPress={submit} saving={submitting} disabled={!canSubmit} />
        </View>
      </View>
    </ScrollView>
  );
}

function Prefill({ label, value, last, t }: { label: string; value: string; last?: boolean; t: (k: string) => string }) {
  return (
    <View style={[styles.pRow, last && styles.pRowLast]}>
      <Text style={styles.pLabel}>{label}</Text>
      <Text style={styles.pValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.pBadge}>{t("cia.app.erp")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 28 },
  notice: { fontSize: 15, color: "#444", textAlign: "center", lineHeight: 22 },
  muted: { color: "#888", fontSize: 14 },
  section: { fontSize: 12, color: "#888", fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  webNote: { backgroundColor: "#fff4e5", borderWidth: 1, borderColor: "#f0d9b5", borderRadius: 10, padding: 10, marginBottom: 10 },
  webNoteTxt: { fontSize: 12, color: "#8a5a00", lineHeight: 17 },
  prefill: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#eee", overflow: "hidden", marginBottom: 16 },
  pRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  pRowLast: { borderBottomWidth: 0 },
  pLabel: { fontSize: 12.5, color: "#888", width: 96 },
  pValue: { flex: 1, fontSize: 14, fontWeight: "700", color: "#333" },
  pBadge: { fontSize: 9, fontWeight: "800", color: "#0b5c8a", backgroundColor: "#e6f0f6", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, overflow: "hidden" },
  doc: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#fff", borderRadius: 12, padding: 11, borderWidth: 1, borderColor: "#eee", marginBottom: 8 },
  docDone: { borderColor: "#bfe3cf", backgroundColor: "#f2fbf5" },
  docIc: { fontSize: 20 },
  docLabel: { fontSize: 14, fontWeight: "600", color: "#333" },
  docReq: { fontSize: 11, fontWeight: "800", color: "#b42318", marginTop: 1 },
  docOpt: { fontSize: 11, color: "#888", marginTop: 1 },
  docCaptured: { fontSize: 11, color: "#0a5c3a", fontWeight: "600", marginTop: 1 },
  cap: { backgroundColor: "#2e7d32", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  capRe: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfe0d6" },
  capTxt: { color: "#fff", fontWeight: "700", fontSize: 12.5 },
  capReTxt: { color: "#1b5e20" },
  progress: { fontSize: 12.5, color: "#888", textAlign: "center", marginTop: 4, marginBottom: 14 },
  btnRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  ghost: { borderWidth: 1, borderColor: "#cfe0d6", backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center", alignItems: "center" },
  ghostTxt: { color: "#1b5e20", fontWeight: "700" },
  successBody: { padding: 24, alignItems: "stretch" },
  art: { fontSize: 52, textAlign: "center", marginTop: 20, marginBottom: 6 },
  h: { fontSize: 20, fontWeight: "800", textAlign: "center", color: "#14201b" },
  p: { fontSize: 14, color: "#888", textAlign: "center", marginTop: 6, marginBottom: 20, lineHeight: 20 },
  big: { backgroundColor: "#2e7d32", borderRadius: 14, padding: 15, alignItems: "center" },
  bigTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
