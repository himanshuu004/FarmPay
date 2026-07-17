/**
 * CIA — express interest in a scheme (society-mediated, ★ farmer-authored). One tap
 * shares the request with the DCS secretary → PENDING_DCS_REVIEW. Idempotent per
 * scheme. Wired to POST /cattle-induction/interest (dcs_ref derived from membership).
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useI18n } from "../lib/i18n";
import { getScheme, expressInterest, CiaInterest } from "../lib/ciaApi";

export default function CiaEoi() {
  const router = useRouter();
  const { t } = useI18n();
  const { scheme } = useLocalSearchParams<{ scheme?: string }>();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<CiaInterest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const s = scheme ? await getScheme(scheme) : null; setTitle((s && s.title) || scheme || ""); } catch {}
    setLoading(false);
  }, [scheme]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = useCallback(async () => {
    if (!scheme || submitting) return;
    setSubmitting(true);
    try {
      const res = await expressInterest(scheme);
      if (res) setDone(res);
      else Alert.alert(t("cia.load_error"));
    } catch {
      Alert.alert(t("cia.load_error"));
    }
    setSubmitting(false);
  }, [scheme, submitting, t]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  // ── success ──
  if (done) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
        <Text style={styles.art}>✅</Text>
        <Text style={styles.h}>{t("cia.eoi.shared_ok")}</Text>
        <Text style={styles.p}>{t("cia.eoi.board_review")}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeTitle}>{title}</Text>
          <Text style={styles.badgeStatus}>{t("cia.eoi.status_submitted").toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={styles.big} onPress={() => router.replace("/cia-status")}>
          <Text style={styles.bigTxt}>{t("cia.eoi.track")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghost} onPress={() => router.replace("/cia-schemes")}>
          <Text style={styles.ghostTxt}>{t("cia.eoi.done")}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── confirm ──
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <Text style={styles.art}>🐄</Text>
      <Text style={styles.h}>{t("cia.eoi.join")} {title}?</Text>
      <Text style={styles.p}>{t("cia.eoi.tell_society")}</Text>

      <View style={styles.rows}>
        <View style={styles.row}><Text style={styles.rowL}>{t("cia.eoi.scheme")}</Text><Text style={styles.rowV}>{title}</Text></View>
        <View style={[styles.row, styles.rowLast]}><Text style={styles.rowL}>{t("cia.eoi.shared_with")}</Text><Text style={styles.rowV}>{t("cia.eoi.secretary")}</Text></View>
      </View>

      <Text style={styles.starnote}>★ {t("cia.eoi.you_author")}</Text>

      <TouchableOpacity style={[styles.big, submitting && styles.bigDisabled]} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigTxt}>{t("cia.eoi.submit")}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  body: { padding: 20, alignItems: "stretch" },
  art: { fontSize: 52, textAlign: "center", marginTop: 12, marginBottom: 4 },
  h: { fontSize: 20, fontWeight: "800", textAlign: "center", color: "#14201b" },
  p: { fontSize: 14, color: "#888", textAlign: "center", marginHorizontal: 8, marginTop: 6, marginBottom: 16, lineHeight: 20 },
  rows: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#eee", overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: "#f2f2f2" },
  rowLast: { borderBottomWidth: 0 },
  rowL: { color: "#888", fontSize: 14 },
  rowV: { fontWeight: "700", fontSize: 14, color: "#333", flexShrink: 1, textAlign: "right", paddingLeft: 10 },
  starnote: { fontSize: 12, color: "#888", textAlign: "center", marginTop: 16, marginBottom: 16 },
  big: { backgroundColor: "#2e7d32", borderRadius: 14, padding: 15, alignItems: "center", marginTop: 8 },
  bigDisabled: { backgroundColor: "#a9c3b1" },
  bigTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
  ghost: { borderRadius: 14, padding: 13, alignItems: "center", marginTop: 8 },
  ghostTxt: { color: "#1b5e20", fontSize: 15, fontWeight: "700" },
  badge: { backgroundColor: "#e9f8ef", borderWidth: 1, borderColor: "#bfe3cf", borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8, marginBottom: 8 },
  badgeTitle: { fontWeight: "800", color: "#14201b", textAlign: "center" },
  badgeStatus: { fontSize: 11, fontWeight: "800", color: "#0a5c3a", backgroundColor: "#d8f0e1", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8, overflow: "hidden" },
});
