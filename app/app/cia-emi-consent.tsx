/**
 * CIA — tri-partite (farmer–society–bank) EMI-deduction consent. Records the
 * authorisation that flips recovery TRACK → INITIATE (the app may then initiate
 * milk-payment deductions). Without it, recovery stays track-only (Convention 33).
 * DPDP: purpose-bound (emi_deduction), timestamped, revocable anytime.
 *
 * Giving consent is Aadhaar step-up protected — on 403 the caller routes to
 * /aadhaar-verify and returns here. Wired to POST /emi/consent (+/revoke).
 * Settled prototype: farmer-emi-consent.html.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { StepUpRequiredError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useContentMax } from "../lib/responsive";
import { getEmi, recordEmiConsent, revokeEmiConsent, myApplications } from "../lib/ciaApi";

export default function CiaEmiConsent() {
  const router = useRouter();
  const { t } = useI18n();
  const cmax = useContentMax();
  const { app } = useLocalSearchParams<{ app?: string }>();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [uuid, setUuid] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

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
      const e = id ? await getEmi(id) : null;
      if (!e) setErr(true); else setActive(e.mode === "INITIATE" || e.consentOnFile);
    } catch { setErr(true); }
    setLoading(false);
  }, [app]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const give = useCallback(async () => {
    if (!uuid || !checked) return;
    setBusy(true);
    try {
      const r = await recordEmiConsent(uuid, "APP-ESIGN:" + uuid);
      if (r.ok) { setActive(true); setChecked(false); Alert.alert(t("cia.emi.c_given")); }
      else Alert.alert(r.message || t("cia.load_error"));
    } catch (e: any) {
      if (e instanceof StepUpRequiredError || e?.name === "StepUpRequiredError") {
        Alert.alert(t("cia.emi.c_stepup"));
        router.push({ pathname: "/aadhaar-verify", params: { returnTo: "/cia-emi-consent" } } as any);
      } else Alert.alert(t("cia.load_error"));
    }
    setBusy(false);
  }, [uuid, checked, t, router]);

  const revoke = useCallback(async () => {
    if (!uuid) return;
    setBusy(true);
    const r = await revokeEmiConsent(uuid);
    setBusy(false);
    if (r.ok) { setActive(false); Alert.alert(t("cia.emi.c_revoked")); }
    else Alert.alert(r.message || t("cia.load_error"));
  }, [uuid, t]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;
  if (err) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("cia.load_error")}</Text>
        <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryTxt}>{t("cia.retry")}</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, cmax]}>
      <View style={[styles.state, active ? styles.stateOn : styles.stateOff]}>
        <Text style={[styles.stateTxt, active ? styles.stateTxtOn : styles.stateTxtOff]}>
          {active ? t("cia.emi.c_mode_initiate") : t("cia.emi.c_mode_track")}
        </Text>
      </View>

      <View style={styles.parties}>
        <Party ic="👨‍🌾" label={t("cia.emi.c_you")} />
        <Party ic="🏘️" label={t("cia.emi.c_society")} />
        <Party ic="🏦" label={t("cia.emi.c_bank")} />
      </View>

      <View style={styles.pending}><Text style={styles.pendingTxt}>📄 {t("cia.emi.c_pending_legal")}</Text></View>

      <View style={styles.auth}>
        <Text style={styles.authHead}>{t("cia.emi.c_head")}</Text>
        <Bullet txt={t("cia.emi.c_p1")} />
        <Bullet txt={t("cia.emi.c_p2")} />
        <Bullet txt={t("cia.emi.c_p3")} />
      </View>

      <Text style={styles.dpdp}>{t("cia.emi.c_dpdp")}</Text>

      {active ? (
        <TouchableOpacity style={styles.revoke} onPress={revoke} disabled={busy}>
          {busy ? <ActivityIndicator color="#b42318" /> : <Text style={styles.revokeTxt}>{t("cia.emi.c_revoke")}</Text>}
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity style={styles.chk} onPress={() => setChecked((v) => !v)} activeOpacity={0.8}>
            <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Text style={styles.boxTick}>✓</Text> : null}</View>
            <Text style={styles.chkTxt}>{t("cia.emi.c_checkbox")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.give, (!checked || busy) && styles.giveOff]} onPress={give} disabled={!checked || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.giveTxt}>{t("cia.emi.c_give")}</Text>}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function Party({ ic, label }: { ic: string; label: string }) {
  return (
    <View style={styles.party}>
      <Text style={styles.partyIc}>{ic}</Text>
      <Text style={styles.partyLabel}>{label}</Text>
    </View>
  );
}
function Bullet({ txt }: { txt: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletTxt}>{txt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5", padding: 28 },
  muted: { color: "#888", fontSize: 14, textAlign: "center" },
  retry: { marginTop: 14, backgroundColor: "#2e7d32", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt: { color: "#fff", fontWeight: "700" },

  state: { borderRadius: 10, padding: 10, marginBottom: 14, alignItems: "center" },
  stateOff: { backgroundColor: "#e8f5ee" },
  stateOn: { backgroundColor: "#d8f0e1" },
  stateTxt: { fontSize: 12.5, fontWeight: "800" },
  stateTxtOff: { color: "#0a5c3a" },
  stateTxtOn: { color: "#0a5c3a" },

  parties: { flexDirection: "row", gap: 8, marginBottom: 14 },
  party: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8e4", borderRadius: 12, padding: 12, alignItems: "center" },
  partyIc: { fontSize: 22 },
  partyLabel: { fontSize: 12.5, fontWeight: "700", color: "#14201b", marginTop: 3 },

  pending: { backgroundColor: "#fef3e2", borderWidth: 1, borderColor: "#f3e2c8", borderRadius: 10, padding: 10, marginBottom: 12 },
  pendingTxt: { color: "#b45309", fontSize: 12, lineHeight: 17 },

  auth: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8e4", borderRadius: 12, padding: 14, marginBottom: 12 },
  authHead: { fontSize: 14.5, fontWeight: "800", color: "#14201b", marginBottom: 8 },
  bullet: { flexDirection: "row", gap: 8, marginBottom: 6 },
  bulletDot: { color: "#0f7a4d", fontSize: 14, fontWeight: "800" },
  bulletTxt: { flex: 1, fontSize: 13, color: "#4a5852", lineHeight: 19 },

  dpdp: { fontSize: 11.5, color: "#888", marginBottom: 14, lineHeight: 17 },

  chk: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 14 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: "#cfd8d3", alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  boxTick: { color: "#fff", fontWeight: "800", fontSize: 14 },
  chkTxt: { flex: 1, fontSize: 13, color: "#333", lineHeight: 19 },

  give: { backgroundColor: "#2e7d32", borderRadius: 12, padding: 14, alignItems: "center" },
  giveOff: { backgroundColor: "#a9c3b1" },
  giveTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  revoke: { borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#f1c7c1", backgroundColor: "#fdf3f2" },
  revokeTxt: { color: "#b42318", fontSize: 15, fontWeight: "800" },
});
