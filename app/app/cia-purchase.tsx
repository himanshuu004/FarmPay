/**
 * CIA — guided cattle purchase. After disbursement the farmer documents the animal
 * step by step: seller → inspection → live GPS → 12-digit ear tag → transport, then
 * submits one capture (→ PURCHASE_INITIATED, assembling the traceability chain). The
 * post-capture phase (vet approval → transit insurance → arrival → cattle insurance →
 * payment gate) is driven by the fine-grained purchase sub-status from the server.
 *
 * Payment is NEVER farmer-authored — the seller-payment gate is a union/finance step
 * and shows here only as a locked status. Media/geo/tag are live-capture only.
 *
 * Wired to GET .../purchase, POST .../purchase/capture, .../insurance/{transit,
 * arrival,cattle}. Settled prototypes: farmer-purchase.html + farmer-insurance.html.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { formatRupees } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useContentMax } from "../lib/responsive";
import { FieldLabel, BigInput } from "../components/FormKit";
import {
  getPurchaseState, capturePurchase, issueTransit, confirmArrival, issueCattle,
  myApplications, CiaPurchaseState, CiaCaptureBody, CiaGeo,
} from "../lib/ciaApi";

type Panel = null | "seller" | "inspect" | "geo" | "eartag" | "transport";
type Seller = { name: string; idProofRef: string; bankAccount: string; photoRef: string; relationshipToBuyer: string };
type Transport = { vehicleRegNo: string; driverName: string; billRef: string; challanRef: string };

const emptySeller: Seller = { name: "", idProofRef: "", bankAccount: "", photoRef: "", relationshipToBuyer: "" };
const TAG_RE = /^\d{12}$/;

/** Live camera capture → returns the asset URI (the evidence ref) or null. */
async function snap(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 0.6, exif: true });
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0].uri;
}

export default function CiaPurchase() {
  const router = useRouter();
  const { t } = useI18n();
  const cmax = useContentMax();
  const { app } = useLocalSearchParams<{ app?: string }>();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [uuid, setUuid] = useState<string | null>(null);
  const [state, setState] = useState<CiaPurchaseState | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  // capture draft (local until the single submit)
  const [seller, setSeller] = useState<Seller>(emptySeller);
  const [photoRefs, setPhotoRefs] = useState<string[]>([]);
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<"MALE" | "FEMALE">("FEMALE");
  const [geo, setGeo] = useState<{ g: CiaGeo; acc: number | null } | null>(null);
  const [earTagNo, setEarTagNo] = useState("");
  const [earTagPhotoRef, setEarTagPhotoRef] = useState("");
  const [transport, setTransport] = useState<Transport>({ vehicleRegNo: "", driverName: "", billRef: "", challanRef: "" });

  const load = useCallback(async () => {
    setLoading(true); setErr(false);
    try {
      let id = app || null;
      if (!id) {
        const apps = await myApplications();
        if (!apps.length) { setErr(true); setLoading(false); return; }
        id = apps[0].applicationUuid;
      }
      setUuid(id);
      const s = id ? await getPurchaseState(id) : null;
      if (!s) setErr(true); else setState(s);
    } catch { setErr(true); }
    setLoading(false);
  }, [app]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── capture-step completeness ──
  const sellerDone = !!(seller.name && seller.idProofRef && seller.bankAccount && seller.photoRef && seller.relationshipToBuyer);
  const inspectDone = photoRefs.length >= 1 && !!species && !!breed;
  const geoDone = !!geo;
  const eartagDone = TAG_RE.test(earTagNo) && !!earTagPhotoRef;
  const canSubmit = sellerDone && inspectDone && geoDone && eartagDone;

  const getLocation = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) { Alert.alert(t("cia.pur.location_denied")); return; }
    setBusy(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGeo({ g: { lat: pos.coords.latitude, lng: pos.coords.longitude }, acc: pos.coords.accuracy ?? null });
    } catch { Alert.alert(t("cia.load_error")); }
    setBusy(false);
  }, [t]);

  const submitCapture = useCallback(async () => {
    if (!uuid || !canSubmit) return;
    setBusy(true);
    const body: CiaCaptureBody = {
      earTagNo, earTagPhotoRef, species, breed, sex,
      purchaseGeo: geo!.g,
      photoRefs,
      seller,
      transport: (transport.vehicleRegNo && transport.driverName && transport.billRef && transport.challanRef) ? transport : undefined,
    };
    const r = await capturePurchase(uuid, body);
    setBusy(false);
    if (r.ok) { setPanel(null); load(); }
    else if (r.errorCode === "CIA_EARTAG_DUPLICATE") Alert.alert(t("cia.pur.tag_dup"));
    else Alert.alert(r.message || t("cia.load_error"));
  }, [uuid, canSubmit, earTagNo, earTagPhotoRef, species, breed, sex, geo, photoRefs, seller, transport, t, load]);

  const doTransit = useCallback(async () => {
    if (!uuid) return; setBusy(true);
    const r = await issueTransit(uuid, state?.animal?.approvedPurchasePrice ? { sumInsured: state.animal.approvedPurchasePrice } : undefined);
    setBusy(false);
    if (r.ok) load(); else Alert.alert(r.message || t("cia.load_error"));
  }, [uuid, state, t, load]);

  const doArrival = useCallback(async () => {
    if (!uuid) return; setBusy(true);
    const r = await confirmArrival(uuid);
    setBusy(false);
    if (r.ok) load(); else Alert.alert(r.message || t("cia.load_error"));
  }, [uuid, t, load]);

  const doCattle = useCallback(async () => {
    if (!uuid || !state?.deliveredAt) return; setBusy(true);
    const effectiveDate = String(state.deliveredAt).slice(0, 10);   // = arrival date (always valid, never backdated)
    const r = await issueCattle(uuid, {
      effectiveDate,
      ...(state.animal?.approvedPurchasePrice ? { sumInsured: state.animal.approvedPurchasePrice } : {}),
    });
    setBusy(false);
    if (r.ok) load();
    else if (r.errorCode === "CIA_INSURANCE_BACKDATED") Alert.alert(t("cia.pur.backdated"));
    else Alert.alert(r.message || t("cia.load_error"));
  }, [uuid, state, t, load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (err || !state) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("cia.load_error")}</Text>
        <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryTxt}>{t("cia.retry")}</Text></TouchableOpacity>
      </View>
    );
  }

  // ── capture sub-panels ──
  if (panel && state.purchasable) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.panelBody, cmax]}>
        <WebNote t={t} />
        <Text style={styles.liveNote}>📷 {t("cia.pur.live_only")}</Text>

        {panel === "seller" && (
          <>
            <FieldLabel en={t("cia.pur.seller_name")} required />
            <BigInput value={seller.name} onChangeText={(v) => setSeller({ ...seller, name: v })} placeholder="" />
            <View style={{ height: 12 }} />
            <FieldLabel en={t("cia.pur.seller_bank")} required />
            <BigInput value={seller.bankAccount} onChangeText={(v) => setSeller({ ...seller, bankAccount: v })} placeholder={t("cia.pur.seller_bank_ph")} />
            <View style={{ height: 12 }} />
            <FieldLabel en={t("cia.pur.seller_rel")} required />
            <BigInput value={seller.relationshipToBuyer} onChangeText={(v) => setSeller({ ...seller, relationshipToBuyer: v })} placeholder={t("cia.pur.seller_rel_ph")} />
            <View style={{ height: 12 }} />
            <PhotoField label={t("cia.pur.seller_id")} value={seller.idProofRef} onCapture={async () => { const u = await snap(); if (u) setSeller((p) => ({ ...p, idProofRef: u })); else Alert.alert(t("cia.app.camera_denied")); }} t={t} />
            <PhotoField label={t("cia.pur.seller_photo")} value={seller.photoRef} onCapture={async () => { const u = await snap(); if (u) setSeller((p) => ({ ...p, photoRef: u })); else Alert.alert(t("cia.app.camera_denied")); }} t={t} />
            <PanelDone onDone={() => setPanel(null)} disabled={!sellerDone} t={t} />
          </>
        )}

        {panel === "inspect" && (
          <>
            <FieldLabel en={t("cia.pur.animal_photos")} required />
            <View style={styles.photoRow}>
              {photoRefs.map((_, i) => <View key={i} style={styles.thumb}><Text style={styles.thumbTxt}>📷 {i + 1}</Text></View>)}
              <TouchableOpacity style={styles.addPhoto} onPress={async () => { const u = await snap(); if (u) setPhotoRefs((p) => [...p, u]); else Alert.alert(t("cia.app.camera_denied")); }}>
                <Text style={styles.addPhotoTxt}>＋ {t("cia.pur.add_photo")}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.count}>{photoRefs.length} {t("cia.pur.photos_count")}</Text>
            <View style={{ height: 10 }} />
            <FieldLabel en={t("cia.pur.species")} required />
            <View style={styles.chips}>
              <Chip on={species === "CATTLE"} label={t("cia.pur.cow")} onPress={() => setSpecies("CATTLE")} />
              <Chip on={species === "BUFFALO"} label={t("cia.pur.buffalo")} onPress={() => setSpecies("BUFFALO")} />
            </View>
            <View style={{ height: 12 }} />
            <FieldLabel en={t("cia.pur.breed")} required />
            <BigInput value={breed} onChangeText={setBreed} placeholder={t("cia.app.breed_ph")} />
            <View style={{ height: 12 }} />
            <FieldLabel en={t("cia.pur.sex")} />
            <View style={styles.chips}>
              <Chip on={sex === "FEMALE"} label={t("cia.pur.female")} onPress={() => setSex("FEMALE")} />
              <Chip on={sex === "MALE"} label={t("cia.pur.male")} onPress={() => setSex("MALE")} />
            </View>
            <PanelDone onDone={() => setPanel(null)} disabled={!inspectDone} t={t} />
          </>
        )}

        {panel === "geo" && (
          <>
            <View style={styles.geoBox}>
              {geo ? (
                <>
                  <Text style={styles.geoOk}>✓ {t("cia.pur.location_ok")}</Text>
                  <Text style={styles.geoCoord}>{geo.g.lat.toFixed(4)}, {geo.g.lng.toFixed(4)}{geo.acc != null ? ` · ${t("cia.pur.accuracy")} ${Math.round(geo.acc)}m` : ""}</Text>
                </>
              ) : <Text style={styles.geoWait}>{busy ? t("cia.pur.locating") : t("cia.pur.s_geo_sub")}</Text>}
            </View>
            <Text style={styles.hint}>{t("cia.pur.geofence_note")}</Text>
            <TouchableOpacity style={styles.primary} onPress={getLocation} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>📍 {t("cia.pur.capture_location")}</Text>}
            </TouchableOpacity>
            <PanelDone onDone={() => setPanel(null)} disabled={!geoDone} t={t} />
          </>
        )}

        {panel === "eartag" && (
          <>
            <FieldLabel en={t("cia.pur.eartag_label")} required />
            <BigInput value={earTagNo} onChangeText={(v) => setEarTagNo(v.replace(/\D/g, "").slice(0, 12))} placeholder="123456789012" numeric strong />
            <Text style={TAG_RE.test(earTagNo) ? styles.valOk : styles.valBad}>
              {TAG_RE.test(earTagNo) ? `✓ ${t("cia.pur.tag_valid")}` : `${earTagNo.length}/12 ${t("cia.pur.tag_need")}`}
            </Text>
            <View style={{ height: 12 }} />
            <PhotoField label={t("cia.pur.eartag_photo")} value={earTagPhotoRef} onCapture={async () => { const u = await snap(); if (u) setEarTagPhotoRef(u); else Alert.alert(t("cia.app.camera_denied")); }} t={t} />
            <PanelDone onDone={() => setPanel(null)} disabled={!eartagDone} t={t} />
          </>
        )}

        {panel === "transport" && (
          <>
            <FieldLabel en={t("cia.pur.vehicle")} />
            <BigInput value={transport.vehicleRegNo} onChangeText={(v) => setTransport({ ...transport, vehicleRegNo: v })} placeholder="UK07AB1234" />
            <View style={{ height: 12 }} />
            <FieldLabel en={t("cia.pur.driver")} />
            <BigInput value={transport.driverName} onChangeText={(v) => setTransport({ ...transport, driverName: v })} placeholder="" />
            <View style={{ height: 12 }} />
            <PhotoField label={t("cia.pur.bill")} value={transport.billRef} onCapture={async () => { const u = await snap(); if (u) setTransport((p) => ({ ...p, billRef: u })); else Alert.alert(t("cia.app.camera_denied")); }} t={t} />
            <PhotoField label={t("cia.pur.challan")} value={transport.challanRef} onCapture={async () => { const u = await snap(); if (u) setTransport((p) => ({ ...p, challanRef: u })); else Alert.alert(t("cia.app.camera_denied")); }} t={t} />
            <PanelDone onDone={() => setPanel(null)} disabled={false} t={t} />
          </>
        )}

        <TouchableOpacity style={styles.backLink} onPress={() => setPanel(null)}>
          <Text style={styles.backLinkTxt}>← {t("common.back")}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── hub ──
  const loan = state.loan;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, cmax]}>
      <View style={styles.loan}>
        <View style={{ flex: 1 }}>
          <Text style={styles.loanAmt}>{loan ? formatRupees(loan.amount) : "—"} <Text style={styles.loanSub}>{t("cia.pur.disbursed")}</Text></Text>
          <Text style={styles.loanHint}>{t("cia.pur.buy_one")}</Text>
        </View>
      </View>

      {state.purchasable ? (
        <>
          <WebNote t={t} />
          <StepRow n={1} title={t("cia.pur.s_seller")} sub={t("cia.pur.s_seller_sub")} done={sellerDone} onPress={() => setPanel("seller")} t={t} />
          <StepRow n={2} title={t("cia.pur.s_inspect")} sub={t("cia.pur.s_inspect_sub")} done={inspectDone} onPress={() => setPanel("inspect")} t={t} />
          <StepRow n={3} title={t("cia.pur.s_geo")} sub={t("cia.pur.s_geo_sub")} done={geoDone} onPress={() => setPanel("geo")} t={t} />
          <StepRow n={4} title={t("cia.pur.s_eartag")} sub={t("cia.pur.s_eartag_sub")} done={eartagDone} onPress={() => setPanel("eartag")} t={t} />
          <StepRow n={5} title={t("cia.pur.s_transport")} sub={t("cia.pur.s_transport_sub")} done={false} optional onPress={() => setPanel("transport")} t={t} />

          <TouchableOpacity style={[styles.submit, !canSubmit && styles.submitOff]} onPress={submitCapture} disabled={!canSubmit || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>{t("cia.pur.submit_capture")}</Text>}
          </TouchableOpacity>
          {!canSubmit ? <Text style={styles.submitHint}>{t("cia.pur.submit_hint")}</Text> : null}
        </>
      ) : !state.captured ? (
        <View style={styles.info}><Text style={styles.infoTxt}>{t("cia.pur.not_ready")}</Text></View>
      ) : (
        <PostCapture state={state} busy={busy} onTransit={doTransit} onArrival={doArrival} onCattle={doCattle} t={t} />
      )}

      <View style={styles.gate}><Text style={styles.gateTxt}>🔒 {t("cia.pur.gate_lock")}</Text></View>
    </ScrollView>
  );
}

/* ------------------------------- sub-views -------------------------------- */

function PostCapture({ state, busy, onTransit, onArrival, onCattle, t }: {
  state: CiaPurchaseState; busy: boolean;
  onTransit: () => void; onArrival: () => void; onCattle: () => void; t: (k: string) => string;
}) {
  const ps = state.purchaseStatus;
  const sum = state.animal?.approvedPurchasePrice;
  if (ps === "PURCHASE_INITIATED" || ps === "VET_VERIFICATION_PENDING") {
    return <ActionCard locked title={t("cia.pur.vet_pending")} sub={t("cia.pur.vet_pending_sub")} />;
  }
  if (ps === "PURCHASE_APPROVED") {
    return (
      <ActionCard title={t("cia.pur.transit_title")} sub={t("cia.pur.transit_sub")}
        extra={sum ? `${t("cia.pur.sum_insured")}: ${formatRupees(sum)}` : undefined}
        cta={t("cia.pur.issue_transit")} onPress={onTransit} busy={busy} />
    );
  }
  if (ps === "TRANSIT_IN_PROGRESS") {
    return <ActionCard title={t("cia.pur.arrival_title")} sub={t("cia.pur.arrival_sub")} cta={t("cia.pur.confirm_arrival")} onPress={onArrival} busy={busy} />;
  }
  if (ps === "CATTLE_DELIVERED") {
    const eff = state.deliveredAt ? String(state.deliveredAt).slice(0, 10) : "";
    return (
      <ActionCard title={t("cia.pur.cattle_title")} sub={t("cia.pur.cattle_sub")}
        extra={`${t("cia.pur.effective_date")}: ${eff}`}
        cta={t("cia.pur.issue_cattle")} onPress={onCattle} busy={busy} />
    );
  }
  if (ps === "INSURANCE_PENDING" || ps === "SELLER_PAYMENT_PENDING") {
    return <ActionCard locked title={t("cia.pur.gate_pending")} sub={t("cia.pur.gate_pending_sub")}
      extra={state.cattlePolicyNo ? `${t("cia.pur.policy_no")}: ${state.cattlePolicyNo}` : undefined} />;
  }
  if (ps === "SELLER_PAID") {
    return <ActionCard done title={t("cia.pur.paid_title")} sub={t("cia.pur.paid_sub")} />;
  }
  return <ActionCard locked title={t("cia.pur.vet_pending")} sub={t("cia.pur.vet_pending_sub")} />;
}

function ActionCard({ title, sub, extra, cta, onPress, busy, locked, done }: {
  title: string; sub: string; extra?: string; cta?: string; onPress?: () => void; busy?: boolean; locked?: boolean; done?: boolean;
}) {
  return (
    <View style={[styles.action, done && styles.actionDone, locked && styles.actionLocked]}>
      <Text style={styles.actionIcon}>{done ? "✅" : locked ? "🔒" : "→"}</Text>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSub}>{sub}</Text>
      {extra ? <Text style={styles.actionExtra}>{extra}</Text> : null}
      {cta && onPress ? (
        <TouchableOpacity style={styles.primary} onPress={onPress} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryTxt}>{cta}</Text>}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function StepRow({ n, title, sub, done, optional, onPress, t }: {
  n: number; title: string; sub: string; done: boolean; optional?: boolean; onPress: () => void; t: (k: string) => string;
}) {
  return (
    <TouchableOpacity style={[styles.step, done && styles.stepDone]} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.stepN, done && styles.stepNDone]}><Text style={[styles.stepNTxt, done && styles.stepNTxtDone]}>{done ? "✓" : n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}{optional ? <Text style={styles.opt}>  ·  {t("cia.app.optional")}</Text> : null}</Text>
        <Text style={styles.stepSub}>{sub}</Text>
      </View>
      <Text style={styles.stepGo}>{done ? t("cia.pur.edit") : t("cia.pur.open")} ›</Text>
    </TouchableOpacity>
  );
}

function PhotoField({ label, value, onCapture, t }: { label: string; value: string; onCapture: () => void; t: (k: string) => string }) {
  return (
    <View style={styles.photoField}>
      <Text style={styles.photoLabel}>{value ? "✅ " : ""}{label}</Text>
      <TouchableOpacity style={[styles.cap, value && styles.capRe]} onPress={onCapture}>
        <Text style={[styles.capTxt, value && styles.capReTxt]}>📷 {value ? t("cia.pur.photo_done") : t("cia.pur.take_photo")}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Web-preview only: camera/GPS capture needs a real device/simulator. */
function WebNote({ t }: { t: (k: string) => string }) {
  if (Platform.OS !== "web") return null;
  return (
    <View style={styles.webNote}>
      <Text style={styles.webNoteTxt}>🖥️ {t("cia.web_capture_note")}</Text>
    </View>
  );
}

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PanelDone({ onDone, disabled, t }: { onDone: () => void; disabled: boolean; t: (k: string) => string }) {
  return (
    <TouchableOpacity style={[styles.primary, disabled && styles.primaryOff, { marginTop: 18 }]} onPress={onDone} disabled={disabled}>
      <Text style={styles.primaryTxt}>{t("cia.pur.save_step")}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 28 },
  muted: { color: "#888", fontSize: 14, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: "#2e7d32", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt: { color: "#fff", fontWeight: "700" },

  loan: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8e4", padding: 14, marginBottom: 14 },
  loanAmt: { fontSize: 19, fontWeight: "800", color: "#0a5c3a" },
  loanSub: { fontSize: 13, fontWeight: "600", color: "#6b7c74" },
  loanHint: { fontSize: 12.5, color: "#6b7c74", marginTop: 3 },

  step: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8e4", padding: 12, marginBottom: 8 },
  stepDone: { borderColor: "#bfe3cf", backgroundColor: "#f2fbf5" },
  stepN: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "#0f7a4d", alignItems: "center", justifyContent: "center" },
  stepNDone: { backgroundColor: "#0f7a4d", borderColor: "#0f7a4d" },
  stepNTxt: { fontSize: 13, fontWeight: "800", color: "#0a5c3a" },
  stepNTxtDone: { color: "#fff" },
  stepTitle: { fontSize: 14.5, fontWeight: "700", color: "#14201b" },
  opt: { fontSize: 12, fontWeight: "600", color: "#9aa8a1" },
  stepSub: { fontSize: 12.5, color: "#6b7c74", marginTop: 1 },
  stepGo: { fontSize: 12.5, fontWeight: "800", color: "#0a5c3a" },

  submit: { backgroundColor: "#2e7d32", borderRadius: 14, padding: 15, alignItems: "center", marginTop: 12 },
  submitOff: { backgroundColor: "#a9c3b1" },
  submitTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
  submitHint: { fontSize: 12.5, color: "#888", textAlign: "center", marginTop: 8 },

  info: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8e4", padding: 16 },
  infoTxt: { fontSize: 14, color: "#6b7c74", textAlign: "center", lineHeight: 20 },

  gate: { backgroundColor: "#fef3e2", borderWidth: 1, borderColor: "#f3e2c8", borderRadius: 10, padding: 12, marginTop: 16 },
  gateTxt: { color: "#b45309", fontSize: 12.5, lineHeight: 18 },

  // action cards (post-capture)
  action: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8e4", padding: 16 },
  actionDone: { borderColor: "#bfe3cf", backgroundColor: "#f2fbf5" },
  actionLocked: { backgroundColor: "#f7f8f7" },
  actionIcon: { fontSize: 22, marginBottom: 4 },
  actionTitle: { fontSize: 16, fontWeight: "800", color: "#14201b" },
  actionSub: { fontSize: 13, color: "#6b7c74", marginTop: 4, lineHeight: 19 },
  actionExtra: { fontSize: 13, fontWeight: "700", color: "#0a5c3a", marginTop: 8 },

  // panels
  panelBody: { padding: 16, paddingBottom: 40 },
  liveNote: { fontSize: 11.5, color: "#0b5c8a", backgroundColor: "#e6f0f6", borderRadius: 8, padding: 8, textAlign: "center", marginBottom: 14, fontWeight: "600" },
  webNote: { backgroundColor: "#fff4e5", borderWidth: 1, borderColor: "#f0d9b5", borderRadius: 10, padding: 10, marginBottom: 12 },
  webNoteTxt: { fontSize: 12, color: "#8a5a00", lineHeight: 17 },
  photoField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#eee", padding: 11, marginBottom: 8 },
  photoLabel: { fontSize: 13.5, color: "#333", flex: 1, paddingRight: 10 },
  cap: { backgroundColor: "#2e7d32", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  capRe: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfe0d6" },
  capTxt: { color: "#fff", fontWeight: "700", fontSize: 12.5 },
  capReTxt: { color: "#1b5e20" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: "#0b120e", alignItems: "center", justifyContent: "center" },
  thumbTxt: { color: "#7fd0a3", fontSize: 11, fontWeight: "700" },
  addPhoto: { width: 56, height: 56, borderRadius: 10, borderWidth: 1, borderColor: "#cfe0d6", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  addPhotoTxt: { color: "#1b5e20", fontSize: 10.5, fontWeight: "800", textAlign: "center" },
  count: { fontSize: 12, color: "#888", marginTop: 6 },
  chips: { flexDirection: "row", gap: 8 },
  chip: { flex: 1, borderWidth: 1, borderColor: "#cfe0d6", borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  chipTxt: { fontSize: 14, fontWeight: "700", color: "#1b5e20" },
  chipTxtOn: { color: "#fff" },
  geoBox: { backgroundColor: "#0b120e", borderRadius: 14, padding: 20, alignItems: "center", marginBottom: 10 },
  geoOk: { color: "#7fd0a3", fontSize: 14, fontWeight: "800" },
  geoCoord: { color: "#cfe", fontSize: 12.5, marginTop: 4, fontFamily: "monospace" },
  geoWait: { color: "#7fd0a3", fontSize: 13 },
  hint: { fontSize: 12, color: "#888", marginBottom: 10 },
  valOk: { fontSize: 12.5, color: "#0a5c3a", fontWeight: "700", marginTop: 6 },
  valBad: { fontSize: 12.5, color: "#b42318", marginTop: 6 },
  primary: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 13, alignItems: "center", marginTop: 12 },
  primaryOff: { backgroundColor: "#a9c3b1" },
  primaryTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  backLink: { alignItems: "center", marginTop: 18, padding: 10 },
  backLinkTxt: { color: "#1b5e20", fontSize: 14, fontWeight: "700" },
});
