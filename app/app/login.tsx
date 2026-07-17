import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { apiPost, setToken, setRefreshToken, setUser, getToken } from "../lib/api";

const showAlert = (title: string, message: string, buttons?: any[]) => {
  if (Platform.OS === "web") { if (typeof window !== "undefined") window.alert(`${title}\n${message}`); }
  else { Alert.alert(title, message, buttons); }
};
import {
  getDeviceInfoString,
  getBiometricStatus,
  authenticateWithBiometrics,
  setBiometricEnabled,
  isBiometricEnabled,
} from "../lib/biometric";

export default function LoginScreen() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [mpin, setMpin] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootChecking, setBootChecking] = useState(true);

  // ── Boot: if a session exists AND biometric is enabled, prompt unlock ──
  useEffect(() => {
    (async () => {
      try {
        const existingToken = await getToken();
        if (!existingToken) return;
        const enabled = await isBiometricEnabled();
        if (!enabled) {
          // Token present but biometric not opted-in → just enter the app
          router.replace("/(tabs)");
          return;
        }
        const ok = await authenticateWithBiometrics("Unlock Allied KCC");
        if (ok) router.replace("/(tabs)");
        // if biometric fails, fall through to password screen
      } finally {
        setBootChecking(false);
      }
    })();
  }, []);

  async function handleLogin() {
    if (!mobile || mobile.length < 10) {
      showAlert("Error", "Please enter a valid 10-digit mobile number");
      return;
    }
    if (!mpin || mpin.length !== 4) {
      showAlert("Error", "MPIN must be exactly 4 digits");
      return;
    }
    setLoading(true);
    try {
      const deviceInfo = getDeviceInfoString();
      const res = await apiPost("/auth/login", { mobile, mpin, deviceInfo });
      if (res.success && res.data?.accessToken) {
        await setToken(res.data.accessToken);
        if (res.data.refreshToken) await setRefreshToken(res.data.refreshToken);
        await setUser({ mobile, name: res.data?.user?.firstName || mobile });

        // Offer biometric opt-in if hardware supports it and user hasn't opted yet
        const bio = await getBiometricStatus();
        if (bio.hardwareAvailable && bio.enrolled && !bio.enabled) {
          showAlert(
            "Faster sign-in?",
            `Use ${bio.capability === "FACE" ? "Face ID" : "fingerprint"} to unlock Allied KCC next time.`,
            [
              { text: "Not now", style: "cancel", onPress: () => router.replace("/(tabs)") },
              {
                text: "Enable",
                onPress: async () => {
                  const ok = await authenticateWithBiometrics("Confirm to enable biometric unlock");
                  if (ok) await setBiometricEnabled(true);
                  router.replace("/(tabs)");
                },
              },
            ],
          );
        } else {
          router.replace("/(tabs)");
        }
      } else {
        showAlert("Login Failed", res.message || "Invalid credentials");
      }
    } catch (e: any) {
      showAlert("Error", "Cannot connect to server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (bootChecking) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🌾</Text>
        <Text style={styles.title}>Allied KCC</Text>
        <Text style={styles.subtitle}>Farmer Dashboard</Text>

        <TextInput
          style={styles.input}
          placeholder="Mobile Number"
          placeholderTextColor="#999"
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={setMobile}
          maxLength={10}
        />

        <TextInput
          style={[styles.input, styles.mpinInput]}
          placeholder="• • • •"
          placeholderTextColor="#bbb"
          secureTextEntry
          keyboardType="number-pad"
          value={mpin}
          onChangeText={setMpin}
          maxLength={4}
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/forgot-password")} style={{ marginTop: 14 }}>
          <Text style={styles.linkText}>Forgot MPIN?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/register")} style={{ marginTop: 10 }}>
          <Text style={styles.linkText}>New here? Register</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Secured by Allied KCC Platform</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1b5e20", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 400, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: "800", color: "#1b5e20", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 24 },
  input: { width: "100%", height: 50, borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 12, backgroundColor: "#fafafa" },
  mpinInput: { textAlign: "center", letterSpacing: 12, fontSize: 22, fontWeight: "700" },
  button: { width: "100%", height: 50, backgroundColor: "#2e7d32", borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  linkText: { color: "#2e7d32", fontSize: 14, fontWeight: "600" },
  footer: { marginTop: 20, fontSize: 11, color: "#bbb" },
});
