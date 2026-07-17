import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView,
} from "react-native";
import { apiGet, apiPost, setToken, setRefreshToken, setUser } from "../lib/api";
import VoiceInputButton from "../components/VoiceInputButton";
import { getDeviceInfoString } from "../lib/biometric";

const showAlert = (title: string, message: string) => {
  if (typeof window !== "undefined") window.alert(`${title}\n${message}`);
};

const STEPS = [
  { en: "Mobile", hi: "मोबाइल" },
  { en: "OTP", hi: "ओटीपी" },
  { en: "MPIN", hi: "एमपिन" },
  { en: "Profile", hi: "प्रोफ़ाइल" },
];

export default function RegisterScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mpin, setMpin] = useState("");
  const [confirmMpin, setConfirmMpin] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpRequestId, setOtpRequestId] = useState("");

  // LGD address
  const [states, setStates] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [villages, setVillages] = useState<any[]>([]);
  const [selectedState, setSelectedState] = useState(0);
  const [selectedDistrict, setSelectedDistrict] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState(0);
  const [selectedVillage, setSelectedVillage] = useState(0);

  // ── Step 1: Enter mobile → Register + Send OTP ────────────────────
  async function handleMobileContinue() {
    if (!mobile || mobile.length < 10) {
      showAlert("Error", "Please enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      // Register with just mobile (firstName is placeholder, updated in step 4)
      const res = await apiPost("/auth/register", { firstName: "Farmer", mobile });
      if (res.success) {
        setOtpRequestId(res.data?.otpRequestId || res.data?.otp_request_id || "");
        setStep(2);
      } else {
        // If user already exists, send OTP for login instead
        if (res.message?.includes("already")) {
          const otpRes = await apiPost("/auth/send-otp", { mobile, purpose: "register" });
          if (otpRes.success) {
            setOtpRequestId(otpRes.data?.otpRequestId || "");
            setStep(2);
          } else {
            showAlert("Error", otpRes.message || "Failed");
          }
        } else {
          showAlert("Error", res.message || "Registration failed");
        }
      }
    } catch {
      showAlert("Error", "Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────
  async function handleVerifyOtp() {
    if (!otp || otp.length !== 6) {
      showAlert("Error", "Please enter the 6-digit OTP");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/auth/verify-otp", { otpRequestId, otpCode: otp });
      if (res.success) {
        setStep(3);
      } else {
        showAlert("Error", res.message || "Invalid OTP");
      }
    } catch {
      showAlert("Error", "Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Set MPIN → Auto-login → Go to Step 4 ─────────────────
  async function handleSetMpin() {
    if (!mpin || mpin.length !== 4) {
      showAlert("Error", "MPIN must be exactly 4 digits");
      return;
    }
    if (mpin !== confirmMpin) {
      showAlert("Error", "MPINs do not match");
      return;
    }
    setLoading(true);
    try {
      const setRes = await apiPost("/auth/set-mpin", { mobile, otpRequestId, mpin });
      if (!setRes.success) {
        showAlert("Error", setRes.message || "Could not set MPIN");
        return;
      }
      // Auto-login
      const deviceInfo = getDeviceInfoString();
      const loginRes = await apiPost("/auth/login", { mobile, mpin, deviceInfo });
      if (loginRes.success && loginRes.data?.accessToken) {
        await setToken(loginRes.data.accessToken);
        if (loginRes.data.refreshToken) await setRefreshToken(loginRes.data.refreshToken);
        // Load states for address step
        try {
          const statesRes = await apiGet("/location/states");
          setStates(statesRes?.data || []);
        } catch { /* ignore */ }
        setStep(4);
      } else {
        showAlert("Error", "Login failed after MPIN set");
      }
    } catch {
      showAlert("Error", "Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4: Name + Address → Save profile → Home ──────────────────
  async function handleProfileSave() {
    if (!firstName.trim()) {
      showAlert("Error", "Please enter your name\nकृपया अपना नाम दर्ज करें");
      return;
    }
    if (!selectedState || !selectedDistrict) {
      showAlert("Error", "Please select State and District\nकृपया राज्य और जिला चुनें");
      return;
    }
    setLoading(true);
    try {
      // Update profile with name
      await apiPost("/farmer/onboarding/step1", {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
      });

      // Save address
      await apiPost("/farmer/onboarding/step3", {
        lgdStateId: selectedState,
        lgdDistrictId: selectedDistrict,
        lgdBlockId: selectedBlock || undefined,
        lgdVillageId: selectedVillage || undefined,
      });

      await setUser({ mobile, name: firstName.trim() });

      showAlert("Data Saved", "Registration complete!\nपंजीकरण पूर्ण!");
      router.replace("/onboarding-activities" as any);
    } catch (e: any) {
      showAlert("Error", e?.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  }

  // ── LGD dropdown loaders ──────────────────────────────────────────
  async function onStateChange(stateId: number) {
    setSelectedState(stateId);
    setSelectedDistrict(0); setSelectedBlock(0); setSelectedVillage(0);
    setDistricts([]); setBlocks([]); setVillages([]);
    if (!stateId) return;
    try {
      const res = await apiGet(`/location/states/${stateId}/districts`);
      setDistricts(res?.data || []);
    } catch { /* ignore */ }
  }

  async function onDistrictChange(districtId: number) {
    setSelectedDistrict(districtId);
    setSelectedBlock(0); setSelectedVillage(0);
    setBlocks([]); setVillages([]);
    if (!districtId) return;
    try {
      const res = await apiGet(`/location/districts/${districtId}/blocks`);
      setBlocks(res?.data || []);
    } catch { /* ignore */ }
  }

  async function onBlockChange(blockId: number) {
    setSelectedBlock(blockId);
    setSelectedVillage(0); setVillages([]);
    if (!blockId) return;
    try {
      const res = await apiGet(`/location/blocks/${blockId}/villages`);
      setVillages(res?.data || []);
    } catch { /* ignore */ }
  }

  async function handleResendOtp() {
    setLoading(true);
    try {
      const res = await apiPost("/auth/send-otp", { mobile, purpose: "register" });
      if (res.success) {
        setOtpRequestId(res.data?.otpRequestId || "");
        showAlert("Sent", "New OTP sent");
      } else {
        showAlert("Error", res.message || "Could not resend");
      }
    } catch {
      showAlert("Error", "Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }

  function handleNext() {
    if (step === 1) handleMobileContinue();
    else if (step === 2) handleVerifyOtp();
    else if (step === 3) handleSetMpin();
    else if (step === 4) handleProfileSave();
  }

  // ── Render helper: dropdown as scrollable list ────────────────────
  const DropdownList = ({ items, selectedId, onSelect, labelKey, idKey, placeholder }:
    { items: any[]; selectedId: number; onSelect: (id: number) => void; labelKey: string; idKey: string; placeholder: string }) => (
    <View style={styles.dropdownWrap}>
      <Text style={styles.dropdownPlaceholder}>{placeholder}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dropdownScroll}>
        {items.map((item) => (
          <TouchableOpacity
            key={item[idKey]}
            style={[styles.dropdownItem, selectedId === item[idKey] && styles.dropdownItemSelected]}
            onPress={() => onSelect(item[idKey])}
            activeOpacity={0.8}
          >
            <Text style={[styles.dropdownText, selectedId === item[idKey] && styles.dropdownTextSelected]}>
              {item[labelKey]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.emoji}>🌾</Text>
          <Text style={styles.title}>Register / पंजीकरण</Text>
          <Text style={styles.subtitle}>Create your Allied KCC account</Text>

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
              <TouchableOpacity onPress={handleResendOtp} disabled={loading}>
                <Text style={styles.resendText}>Resend OTP / पुनः भेजें</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Step 3: MPIN */}
          {step === 3 && (
            <>
              <Text style={styles.fieldLabel}>Set 4-digit MPIN / एमपिन सेट करें</Text>
              <Text style={styles.hint}>Avoid simple PINs like 1234 or 0000</Text>
              <TextInput
                style={[styles.input, styles.mpinInput]}
                placeholder="----"
                placeholderTextColor="#bbb"
                keyboardType="number-pad"
                value={mpin}
                onChangeText={setMpin}
                maxLength={4}
                secureTextEntry
                autoFocus
              />
              <Text style={styles.fieldLabel}>Confirm MPIN / एमपिन पुष्टि करें</Text>
              <TextInput
                style={[styles.input, styles.mpinInput]}
                placeholder="----"
                placeholderTextColor="#bbb"
                keyboardType="number-pad"
                value={confirmMpin}
                onChangeText={setConfirmMpin}
                maxLength={4}
                secureTextEntry
              />
            </>
          )}

          {/* Step 4: Name + Address */}
          {step === 4 && (
            <>
              <Text style={styles.fieldLabel}>Your Name / आपका नाम *</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="First Name / पहला नाम"
                  placeholderTextColor="#999"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoFocus
                />
                <VoiceInputButton onResult={setFirstName} language="hi" />
              </View>
              <View style={{ height: 12 }} />
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Last Name / उपनाम (optional)"
                  placeholderTextColor="#999"
                  value={lastName}
                  onChangeText={setLastName}
                />
                <VoiceInputButton onResult={setLastName} language="hi" />
              </View>
              <View style={{ height: 12 }} />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Your Address / आपका पता</Text>

              {/* State */}
              {states.length > 0 && (
                <DropdownList
                  items={states}
                  selectedId={selectedState}
                  onSelect={onStateChange}
                  labelKey="stateName"
                  idKey="stateId"
                  placeholder="State / राज्य *"
                />
              )}

              {/* District */}
              {districts.length > 0 && (
                <DropdownList
                  items={districts}
                  selectedId={selectedDistrict}
                  onSelect={onDistrictChange}
                  labelKey="districtName"
                  idKey="districtId"
                  placeholder="District / जिला *"
                />
              )}

              {/* Block / Tehsil */}
              {blocks.length > 0 && (
                <DropdownList
                  items={blocks}
                  selectedId={selectedBlock}
                  onSelect={onBlockChange}
                  labelKey="blockName"
                  idKey="blockId"
                  placeholder="Block / Tehsil / तहसील"
                />
              )}

              {/* Village */}
              {villages.length > 0 && (
                <DropdownList
                  items={villages}
                  selectedId={selectedVillage}
                  onSelect={(id) => setSelectedVillage(id)}
                  labelKey="villageName"
                  idKey="villageId"
                  placeholder="Village / गाँव"
                />
              )}

              {!states.length && (
                <ActivityIndicator size="small" color="#2e7d32" style={{ marginVertical: 8 }} />
              )}
            </>
          )}

          {/* Action Button */}
          <TouchableOpacity style={styles.button} onPress={handleNext} disabled={loading} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {step === 1
                  ? "Send OTP / ओटीपी भेजें"
                  : step === 2
                  ? "Verify / सत्यापित करें"
                  : step === 3
                  ? "Set MPIN / एमपिन सेट करें"
                  : "Save & Continue / सहेजें"}
              </Text>
            )}
          </TouchableOpacity>

          {/* Back to Login */}
          <TouchableOpacity onPress={() => router.back()} style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? Login / लॉगिन करें</Text>
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
  subtitle: { fontSize: 13, color: "#888", marginBottom: 20 },

  stepRow: { flexDirection: "row", justifyContent: "center", marginBottom: 24, gap: 16 },
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

  // Dropdown styles for LGD selection
  dropdownWrap: { width: "100%", marginBottom: 12 },
  dropdownPlaceholder: { fontSize: 12, fontWeight: "600", color: "#888", marginBottom: 6 },
  dropdownScroll: { maxHeight: 44 },
  dropdownItem: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#e0e0e0", backgroundColor: "#fafafa", marginRight: 8,
  },
  dropdownItemSelected: { borderColor: "#2e7d32", backgroundColor: "#e8f5e9" },
  dropdownText: { fontSize: 13, color: "#555" },
  dropdownTextSelected: { color: "#2e7d32", fontWeight: "700" },
});
