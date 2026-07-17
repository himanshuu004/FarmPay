/**
 * Aadhaar Step-Up Verification Screen (Tier-2 Auth)
 *
 * Required before any DICE financial operation (loans, insurance, repayments).
 * Flow:
 *   1. User enters 12-digit Aadhaar
 *   2. [POST /auth/aadhaar/send-otp] → UIDAI sends OTP to Aadhaar-linked mobile
 *   3. User enters 6-digit OTP
 *   4. [POST /auth/aadhaar/verify-otp] → returns 15-min step-up token
 *   5. Navigate back to returnTo path (default: /(tabs)/loans)
 */
import { useState, useRef } from "react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native";
import { apiPost } from "../lib/api";
import { setAadhaarSession } from "../lib/aadhaarAuth";
import * as ImagePicker from "expo-image-picker";
import { extractTextFromImage, parseAadhaarNumber } from "../lib/ocrService";

export default function AadhaarVerifyScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [step, setStep] = useState<"aadhaar" | "otp">("aadhaar");
  const [aadhaar, setAadhaar] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequestId, setOtpRequestId] = useState("");
  const [aadhaarLast4, setAadhaarLast4] = useState("");
  const [demoOtp, setDemoOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const otpInputRef = useRef<TextInput>(null);

  // ─── OCR Scan Aadhaar Card ─────────────────────────────────────
  const handleScanAadhaar = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Camera access is required to scan Aadhaar card");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;

      setScanning(true);
      const text = await extractTextFromImage(result.assets[0].uri);
      const aadhaarNum = parseAadhaarNumber(text);

      if (aadhaarNum) {
        const formatted = aadhaarNum.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
        setAadhaar(formatted);
        Alert.alert("Scanned!", `Aadhaar number detected: ${formatted}\nPlease verify and proceed.`);
      } else {
        Alert.alert("Could not read", "Aadhaar number not found in photo. Please enter manually or try a clearer photo.");
      }
    } catch (e: any) {
      Alert.alert("Scan failed", e?.message || "Please try again");
    } finally {
      setScanning(false);
    }
  };

  const formatAadhaar = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 12);
    return digits.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3").trim();
  };

  const sendOtp = async () => {
    const raw = aadhaar.replace(/\s/g, "");
    if (raw.length !== 12) {
      Alert.alert("Invalid Aadhaar", "Please enter a valid 12-digit Aadhaar number.");
      return;
    }
    if (!/^[2-9]/.test(raw)) {
      Alert.alert("Invalid Aadhaar", "Aadhaar cannot start with 0 or 1.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/aadhaar/send-otp", { aadhaar: raw });
      if (res.success) {
        setOtpRequestId(res.data.otpRequestId);
        setAadhaarLast4(res.data.aadhaarLast4);
        if (res.data.demoOtp) setDemoOtp(res.data.demoOtp);
        setStep("otp");
        setTimeout(() => otpInputRef.current?.focus(), 300);
      } else {
        Alert.alert("Error", res.message || "Failed to send OTP");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Network error");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) {
      Alert.alert("Invalid OTP", "Please enter the 6-digit OTP.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/aadhaar/verify-otp", {
        otpRequestId,
        otpCode: otp,
      });
      if (res.success) {
        await setAadhaarSession(
          res.data.stepUpToken,
          res.data.expiresAt,
          res.data.aadhaarLast4
        );
        Alert.alert(
          "Verified ✓",
          `Aadhaar verified. You now have 15 minutes of DICE access.`,
          [{ text: "Continue", onPress: () => {
            if (returnTo) router.replace(returnTo as any);
            else router.replace("/activity-dairy" as any);
          }}]
        );
      } else {
        Alert.alert("Verification failed", res.message || "Invalid OTP");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Network error");
    }
    setLoading(false);
  };

  const resendOtp = () => {
    setStep("aadhaar");
    setOtp("");
    setOtpRequestId("");
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "DICE Security Check",
          headerStyle: { backgroundColor: "#e65100" },
          headerTintColor: "#fff",
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: "#fff3e0" }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* Badge */}
          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>🛡️</Text>
            <Text style={styles.badgeText}>TIER-2 AUTHENTICATION</Text>
          </View>

          <Text style={styles.title}>Aadhaar Verification Required</Text>
          <Text style={styles.subtitle}>
            To access loans, insurance, and financial operations, please verify your
            identity with Aadhaar OTP (required once every 15 minutes).
          </Text>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoLine}>✓ RBI-compliant step-up authentication</Text>
            <Text style={styles.infoLine}>✓ Your Aadhaar number is never stored</Text>
            <Text style={styles.infoLine}>✓ Session expires automatically after 15 min</Text>
          </View>

          {step === "aadhaar" ? (
            <>
              {/* OCR Scan Button */}
              <TouchableOpacity
                style={{ backgroundColor: "#e3f2fd", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 14, borderWidth: 1.5, borderColor: "#1565c0" }}
                onPress={handleScanAadhaar}
                disabled={scanning}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 28, marginBottom: 4 }}>{scanning ? "⏳" : "📷"}</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#1565c0" }}>
                  {scanning ? "Scanning... / स्कैन हो रहा है..." : "Scan Aadhaar Card / आधार कार्ड स्कैन करें"}
                </Text>
                <Text style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                  Take a photo — number will auto-fill / फोटो लें — नंबर अपने आप भर जाएगा
                </Text>
              </TouchableOpacity>

              <Text style={styles.label}>Aadhaar Number / आधार संख्या</Text>
              <TextInput
                style={styles.input}
                placeholder="1234 5678 9012"
                value={aadhaar}
                onChangeText={(t) => setAadhaar(formatAadhaar(t))}
                keyboardType="number-pad"
                maxLength={14}
                autoFocus
              />
              <Text style={styles.hint}>12-digit Aadhaar · enter manually or scan above</Text>

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={sendOtp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Send OTP to Aadhaar Mobile</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.aadhaarSent}>
                <Text style={styles.sentLabel}>OTP sent for Aadhaar ending</Text>
                <Text style={styles.sentNum}>XXXX XXXX {aadhaarLast4}</Text>
              </View>

              {demoOtp ? (
                <View style={styles.demoHint}>
                  <Text style={styles.demoLabel}>🎬 DEMO MODE</Text>
                  <Text style={styles.demoOtpNum}>OTP: {demoOtp}</Text>
                  <Text style={styles.demoNote}>(In production this is sent via UIDAI)</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Enter 6-digit OTP</Text>
              <TextInput
                ref={otpInputRef}
                style={[styles.input, styles.otpInput]}
                placeholder="• • • • • •"
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
              />

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={verifyOtp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Verify & Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={resendOtp} style={styles.resendBtn}>
                <Text style={styles.resendText}>← Change Aadhaar / Resend OTP</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.footer}>
            🔒 Your data is encrypted and protected under the DPDP Act, 2023.{"\n"}
            Raw Aadhaar numbers are never stored in our systems.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#e65100", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, alignSelf: "flex-start", marginBottom: 16,
  },
  badgeIcon: { fontSize: 14 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: "800", color: "#333", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#666", lineHeight: 21, marginBottom: 20 },
  infoBox: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14,
    borderLeftWidth: 4, borderLeftColor: "#2e7d32", marginBottom: 24,
  },
  infoLine: { fontSize: 12, color: "#2e7d32", marginVertical: 2, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "700", color: "#444", marginBottom: 6 },
  input: {
    backgroundColor: "#fff", borderRadius: 10, padding: 16,
    fontSize: 18, fontWeight: "600", borderWidth: 1.5, borderColor: "#ffb74d",
    letterSpacing: 2,
  },
  otpInput: { textAlign: "center", fontSize: 28, letterSpacing: 10 },
  hint: { fontSize: 11, color: "#999", marginTop: 4, marginBottom: 20 },
  btn: {
    backgroundColor: "#e65100", paddingVertical: 16, borderRadius: 12,
    alignItems: "center", marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  aadhaarSent: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    alignItems: "center", marginBottom: 16,
  },
  sentLabel: { fontSize: 12, color: "#888", marginBottom: 4 },
  sentNum: { fontSize: 20, fontWeight: "800", color: "#333", letterSpacing: 2 },
  demoHint: {
    backgroundColor: "#fff9c4", borderRadius: 10, padding: 12,
    borderLeftWidth: 4, borderLeftColor: "#f57f17", marginBottom: 16, alignItems: "center",
  },
  demoLabel: { fontSize: 11, fontWeight: "900", color: "#f57f17", letterSpacing: 1 },
  demoOtpNum: { fontSize: 22, fontWeight: "900", color: "#e65100", letterSpacing: 4, marginTop: 4 },
  demoNote: { fontSize: 10, color: "#999", marginTop: 4, fontStyle: "italic" },
  resendBtn: { alignItems: "center", marginTop: 16, padding: 8 },
  resendText: { color: "#e65100", fontSize: 13, fontWeight: "600" },
  footer: { fontSize: 10, color: "#999", textAlign: "center", marginTop: 32, lineHeight: 16 },
});
