import { useState } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView,
} from "react-native";
import { apiPost } from "../lib/api";

/**
 * Forgot MPIN flow:
 *   Step 1: mobile → /auth/forgot-mpin
 *   Step 2: OTP → /auth/verify-otp
 *   Step 3: new MPIN → /auth/set-mpin (uses same verified otpRequestId)
 */

const STEPS = [
  { en: "Mobile", hi: "मोबाइल" },
  { en: "OTP", hi: "ओटीपी" },
  { en: "New MPIN", hi: "नया एमपिन" },
];

export default function ForgotMpinScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [newMpin, setNewMpin] = useState("");
  const [confirmMpin, setConfirmMpin] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpRequestId, setOtpRequestId] = useState("");

  async function handleSendOtp() {
    if (!mobile || mobile.length < 10) {
      Alert.alert("Error / त्रुटि", "Please enter a valid 10-digit mobile number\nकृपया 10 अंकों का मोबाइल नंबर दर्ज करें");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/forgot-mpin", { mobile });
      if (res.success) {
        const reqId = res.data?.otpRequestId || res.data?.otp_request_id || "";
        setOtpRequestId(reqId);
        setStep(2);
      } else {
        Alert.alert("Error / त्रुटि", res.message || "Could not send OTP");
      }
    } catch {
      Alert.alert("Error / त्रुटि", "Cannot connect to server.\nसर्वर से कनेक्ट नहीं हो पा रहा।");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp || otp.length !== 6) {
      Alert.alert("Error / त्रुटि", "Please enter the 6-digit OTP\nकृपया 6 अंकों का OTP दर्ज करें");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/verify-otp", { otpRequestId, otpCode: otp });
      if (res.success) {
        setStep(3);
      } else {
        Alert.alert("Error / त्रुटि", res.message || "Invalid OTP");
      }
    } catch {
      Alert.alert("Error / त्रुटि", "Cannot connect to server.\nसर्वर से कनेक्ट नहीं हो पा रहा।");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetMpin() {
    if (!newMpin || newMpin.length !== 4) {
      Alert.alert("Error / त्रुटि", "MPIN must be exactly 4 digits\nएमपिन ठीक 4 अंकों का होना चाहिए");
      return;
    }
    if (newMpin !== confirmMpin) {
      Alert.alert("Error / त्रुटि", "MPINs do not match\nएमपिन मेल नहीं खाते");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/set-mpin", { mobile, otpRequestId, mpin: newMpin });
      if (res.success) {
        Alert.alert(
          "Success / सफल",
          "MPIN reset successful! Please login.\nएमपिन रीसेट सफल! कृपया लॉगिन करें।",
          [{ text: "OK", onPress: () => router.replace("/login") }]
        );
      } else {
        Alert.alert("Error / त्रुटि", res.message || "MPIN reset failed");
      }
    } catch {
      Alert.alert("Error / त्रुटि", "Cannot connect to server.\nसर्वर से कनेक्ट नहीं हो पा रहा।");
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (step === 1) handleSendOtp();
    else if (step === 2) handleVerifyOtp();
    else handleSetMpin();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.emoji}>🔑</Text>
          <Text style={styles.title}>Reset MPIN</Text>
          <Text style={styles.subtitle}>एमपिन रीसेट करें</Text>

          {/* Step Indicator */}
          <View style={styles.stepRow}>
            {STEPS.map((s, i) => (
              <View key={i} style={styles.stepItem}>
                <View style={[styles.stepCircle, step > i + 1 ? styles.stepActive : step === i + 1 ? styles.stepCurrent : styles.stepInactive]}>
                  <Text style={[styles.stepNum, (step > i || step === i + 1) && styles.stepNumActive]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, step === i + 1 && styles.stepLabelActive]}>{s.en}</Text>
                <Text style={[styles.stepLabelHi, step === i + 1 && styles.stepLabelActive]}>{s.hi}</Text>
              </View>
            ))}
          </View>

          {/* Step 1: Mobile */}
          {step === 1 && (
            <>
              <Text style={styles.fieldLabel}>Mobile Number / मोबाइल नंबर</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 10-digit mobile number"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                value={mobile}
                onChangeText={setMobile}
                maxLength={10}
                autoFocus
              />
            </>
          )}

          {/* Step 2: OTP */}
          {step === 2 && (
            <>
              <Text style={styles.fieldLabel}>Enter OTP / ओटीपी दर्ज करें</Text>
              <Text style={styles.hint}>OTP sent to {mobile}</Text>
              <TextInput
                style={styles.input}
                placeholder="6-digit OTP"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={6}
                autoFocus
              />
              <TouchableOpacity onPress={handleSendOtp} disabled={loading}>
                <Text style={styles.resendText}>Resend OTP / पुनः भेजें</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Step 3: New MPIN */}
          {step === 3 && (
            <>
              <Text style={styles.fieldLabel}>New MPIN / नया एमपिन</Text>
              <Text style={styles.hint}>Avoid simple PINs like 1234 or 0000</Text>
              <TextInput
                style={[styles.input, styles.mpinInput]}
                placeholder="• • • •"
                placeholderTextColor="#bbb"
                secureTextEntry
                keyboardType="number-pad"
                value={newMpin}
                onChangeText={setNewMpin}
                maxLength={4}
                autoFocus
              />
              <Text style={styles.fieldLabel}>Confirm MPIN / एमपिन पुष्टि करें</Text>
              <TextInput
                style={[styles.input, styles.mpinInput]}
                placeholder="• • • •"
                placeholderTextColor="#bbb"
                secureTextEntry
                keyboardType="number-pad"
                value={confirmMpin}
                onChangeText={setConfirmMpin}
                maxLength={4}
              />
            </>
          )}

          {/* Action Button */}
          <TouchableOpacity style={styles.button} onPress={handleNext} disabled={loading} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {step === 1 ? "Send OTP / ओटीपी भेजें" : step === 2 ? "Verify / सत्यापित करें" : "Reset MPIN / रीसेट करें"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.linkRow}>
            <Text style={styles.linkText}>Back to Login / लॉगिन पर वापस</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1b5e20" },
  scrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: {
    backgroundColor: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 400,
    alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: "800", color: "#1b5e20", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 20 },

  stepRow: { flexDirection: "row", justifyContent: "center", marginBottom: 24, gap: 24 },
  stepItem: { alignItems: "center" },
  stepCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center", marginBottom: 4 },
  stepActive: { backgroundColor: "#1b5e20" },
  stepCurrent: { backgroundColor: "#2e7d32" },
  stepInactive: { backgroundColor: "#e0e0e0" },
  stepNum: { fontSize: 14, fontWeight: "700", color: "#999" },
  stepNumActive: { color: "#fff" },
  stepLabel: { fontSize: 11, color: "#999" },
  stepLabelHi: { fontSize: 10, color: "#bbb" },
  stepLabelActive: { color: "#1b5e20", fontWeight: "600" },

  fieldLabel: { alignSelf: "flex-start", fontSize: 13, fontWeight: "600", color: "#444", marginBottom: 6, marginTop: 4 },
  hint: { alignSelf: "flex-start", fontSize: 12, color: "#888", marginBottom: 8 },
  input: {
    width: "100%", height: 50, borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16, marginBottom: 12, backgroundColor: "#fafafa",
  },
  mpinInput: { textAlign: "center", letterSpacing: 12, fontSize: 22, fontWeight: "700" },
  resendText: { color: "#2e7d32", fontSize: 13, fontWeight: "600", marginBottom: 8 },

  button: {
    width: "100%", height: 50, backgroundColor: "#2e7d32", borderRadius: 12,
    justifyContent: "center", alignItems: "center", marginTop: 12,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  linkRow: { marginTop: 16 },
  linkText: { color: "#2e7d32", fontSize: 13, fontWeight: "600" },
});
