/**
 * Home — built around the FARMER'S DAILY LOOP, not the product narrative.
 *
 * Order = frequency. The two things a dairy farmer does every day — log milk and
 * log expenses — are big, one-tap buttons at the very top (no drilling through
 * Farm → Dairy → Logbook). Below: quick actions, a today snapshot, any urgent
 * alerts, then the less-frequent journeys (passbook weekly, KCC once, insurance
 * once a season) as compact cards. Bilingual (Hindi + English) for the target user.
 */
import { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { apiGet, getUser, formatRupees } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useContentMax } from "../../lib/responsive";

export default function Home() {
  const router = useRouter();
  const { t } = useI18n();
  const cmax = useContentMax(880);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string>("");
  const [pb, setPb] = useState<any>(null);
  const [kcc, setKcc] = useState<any>(null);
  const [protection, setProtection] = useState<any>(null);
  const [renewalsDue, setRenewalsDue] = useState(0);
  const [urgent, setUrgent] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = await getUser().catch(() => null);
      if (u) setName(u.first_name || u.firstName || u.name || "");
      const [a, b, c, d, e] = await Promise.all([
        apiGet("/coop/passbook"), apiGet("/kcc/facility"),
        apiGet("/kavach/policies/me"), apiGet("/kavach/renewals/due"),
        apiGet("/advisory/feed?status=OPEN").catch(() => ({ success: false })),
      ]);
      if (a.success) setPb(a.data);
      if (b.success) setKcc(b.data);
      if (c.success) setProtection(c.data?.snapshot);
      if (d.success) setRenewalsDue((d.data || []).length);
      if (e.success) setUrgent((e.data || []).find((x: any) => x.severity === "URGENT") || null);
    } catch (err) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const isMember = pb && pb.isMember !== false;
  const availLimit = pb?.availableOrderLimit ?? 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ padding: 16, paddingBottom: 32 }, cmax]}>
      <Text style={styles.hello}>{t("home.greeting")}{name ? `, ${name}` : ""} 🙏</Text>
      <Text style={styles.sub}>{t("home.record_today")}</Text>

      {/* ── PRIMARY DAILY ACTIONS — one tap, no drilling ── */}
      <View style={styles.primaryRow}>
        <TouchableOpacity style={[styles.primary, styles.primaryMilk]} activeOpacity={0.85} onPress={() => router.push("/dairy-log-revenue")}>
          <Text style={styles.primaryIcon}>🥛</Text>
          <Text style={styles.primaryLabel}>{t("home.log_milk")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primary, styles.primaryExpense]} activeOpacity={0.85} onPress={() => router.push("/dairy-log-cost")}>
          <Text style={styles.primaryIcon}>💰</Text>
          <Text style={[styles.primaryLabel, styles.expenseText]}>{t("home.log_expense")}</Text>
        </TouchableOpacity>
      </View>

      {/* ── QUICK ACTIONS ── */}
      <View style={styles.quickRow}>
        <Quick icon="📒" label={t("home.logbook")} onPress={() => router.push("/dairy-logbook")} />
        <Quick icon="🐄" label={t("home.animals")} onPress={() => router.push("/dairy-animals")} />
        <Quick icon="💊" label={t("home.treatment")} onPress={() => router.push("/dairy-treatment")} />
      </View>

      {/* ── TODAY SNAPSHOT ── */}
      {isMember ? (
        <TouchableOpacity style={styles.snap} activeOpacity={0.85} onPress={() => router.push("/society")}>
          <View style={styles.snapCol}>
            <Text style={styles.snapVal}>{formatRupees(availLimit)}</Text>
            <Text style={styles.snapLbl}>{t("home.credit_ready")}</Text>
          </View>
          <View style={styles.snapDivider} />
          <View style={styles.snapCol}>
            <Text style={styles.snapVal}>{formatRupees(pb?.outstandingPayables ?? 0)}</Text>
            <Text style={styles.snapLbl}>{t("home.milk_dues")}</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* ── ALERTS (only when there's something to act on) ── */}
      {urgent ? (
        <TouchableOpacity style={[styles.alert, styles.alertRed]} activeOpacity={0.85} onPress={() => router.push("/dairy-treatment")}>
          <Text style={styles.alertIcon}>🚨</Text>
          <Text style={styles.alertText}>{urgent.animalLabel ? `${urgent.animalLabel}: ` : ""}{urgent.title}</Text>
        </TouchableOpacity>
      ) : null}
      {renewalsDue > 0 ? (
        <TouchableOpacity style={[styles.alert, styles.alertAmber]} activeOpacity={0.85} onPress={() => router.push("/pashu-renew")}>
          <Text style={styles.alertIcon}>⏳</Text>
          <Text style={[styles.alertText, styles.alertAmberText]}>{renewalsDue} {t("home.renewal_due")}</Text>
        </TouchableOpacity>
      ) : null}

      {/* ── JOURNEYS (less frequent → compact, insurance last) ── */}
      <Text style={styles.sectionLabel}>{t("home.my_accounts")}</Text>

      <TouchableOpacity style={styles.journey} activeOpacity={0.85} onPress={() => router.push("/society")}>
        <Text style={styles.jIcon}>🥛</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.jTitle}>{t("home.milk_passbook")}</Text>
          <Text style={styles.jSub}>{isMember ? (pb?.freshness || t("home.passbook_sub")) : t("home.join_society")}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.journey} activeOpacity={0.85} onPress={() => router.push("/kcc")}>
        <Text style={styles.jIcon}>💳</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.jTitle}>{kcc?.hasFacility ? formatRupees(kcc.cmpl) + " " + t("home.kcc_limit") : t("home.your_kcc")}</Text>
          <Text style={styles.jSub}>{kcc?.hasFacility ? String(kcc.status).replace(/_/g, " ").toLowerCase() : t("home.kcc_unlock")}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.journey} activeOpacity={0.85} onPress={() => router.push("/cia-schemes")}>
        <Text style={styles.jIcon}>🐄</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.jTitle}>{t("home.cia_title")}</Text>
          <Text style={styles.jSub}>{t("home.cia_sub")}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.journey} activeOpacity={0.85} onPress={() => router.push("/suraksha")}>
        <Text style={styles.jIcon}>🛡️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.jTitle}>{t("home.animal_insurance")}</Text>
          <Text style={styles.jSub}>{protection?.label || t("home.protect")} · {t("home.once_a_season")}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Quick({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quick} activeOpacity={0.85} onPress={onPress}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f5" },
  hello: { fontSize: 24, fontWeight: "800", color: "#1b5e20" },
  sub: { fontSize: 14, color: "#777", marginTop: 2, marginBottom: 16 },

  // Primary daily actions
  primaryRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  primary: { flex: 1, borderRadius: 18, paddingVertical: 20, alignItems: "center", justifyContent: "center", minHeight: 128 },
  primaryMilk: { backgroundColor: "#0f7a4d" },
  primaryExpense: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#0f7a4d" },
  primaryIcon: { fontSize: 40, marginBottom: 6 },
  primaryLabel: { fontSize: 18, fontWeight: "800", color: "#fff" },
  primaryHi: { fontSize: 15, fontWeight: "700", color: "rgba(255,255,255,0.9)", marginTop: 2 },
  expenseText: { color: "#0f7a4d" },
  expenseHi: { color: "#2e7d32" },

  // Quick actions
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  quick: { flex: 1, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#eee" },
  quickIcon: { fontSize: 26, marginBottom: 4 },
  quickLabel: { fontSize: 13, fontWeight: "700", color: "#1b5e20" },
  quickHi: { fontSize: 12, color: "#999", marginTop: 1 },

  // Today snapshot
  snap: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#eee", alignItems: "center" },
  snapCol: { flex: 1, alignItems: "center" },
  snapDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#eee" },
  snapVal: { fontSize: 20, fontWeight: "800", color: "#1b5e20" },
  snapLbl: { fontSize: 11, color: "#888", marginTop: 3, textAlign: "center" },

  // Alerts
  alert: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  alertRed: { backgroundColor: "#fdecea", borderColor: "#f5c6c0" },
  alertAmber: { backgroundColor: "#fff8ec", borderColor: "#f0dcc0" },
  alertIcon: { fontSize: 20 },
  alertText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#b3261e" },
  alertAmberText: { color: "#b4530a" },

  // Journeys
  sectionLabel: { fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginTop: 8, marginBottom: 8 },
  journey: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#eee" },
  jIcon: { fontSize: 24 },
  jTitle: { fontSize: 15, fontWeight: "800", color: "#1b5e20" },
  jSub: { fontSize: 12, color: "#888", marginTop: 2 },
  arrow: { fontSize: 22, color: "#ccc" },
});
