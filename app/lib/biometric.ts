/**
 * Biometric Auth Helper
 *
 * Wraps expo-local-authentication so the rest of the app doesn't have to
 * worry about hardware support, enrollment state, or platform differences.
 *
 * Pattern:
 *   1. After a successful password login, ask the farmer if they want to
 *      enable fingerprint/face unlock for next time.
 *   2. If they accept, we set "fp_biometric_enabled" = "1" in storage. We
 *      DO NOT store the password — biometric auth merely unlocks the
 *      already-stored access/refresh tokens.
 *   3. On app boot, if a token exists AND biometric is enabled, we prompt
 *      for biometric BEFORE letting them into the home screen.
 *   4. If biometric fails or is unavailable, we fall back to the password
 *      login screen and clear local tokens.
 *
 * Honest disclaimers:
 *   - This is convenience UX, not a second factor against device theft. The
 *     refresh token is still in AsyncStorage, encrypted only by the OS file
 *     vault. For higher-trust flows we use Aadhaar step-up (Tier-2).
 */

import * as LocalAuthentication from "expo-local-authentication";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const KEY_BIOMETRIC_ENABLED = "fp_biometric_enabled";

export type BiometricCapability =
  | "FINGERPRINT"
  | "FACE"
  | "IRIS"
  | "MULTIPLE"
  | "NONE";

export interface BiometricStatus {
  hardwareAvailable: boolean;
  enrolled: boolean;
  capability: BiometricCapability;
  enabled: boolean; // user has opted-in via setBiometricEnabled
}

/** Probes the device for biometric support + enrollment + opt-in flag. */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  try {
    const hardwareAvailable = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hardwareAvailable
      ? await LocalAuthentication.isEnrolledAsync()
      : false;

    let capability: BiometricCapability = "NONE";
    if (enrolled) {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const has = (t: LocalAuthentication.AuthenticationType) => types.includes(t);
      const fp = has(LocalAuthentication.AuthenticationType.FINGERPRINT);
      const face = has(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const iris = has(LocalAuthentication.AuthenticationType.IRIS);
      if (fp && face) capability = "MULTIPLE";
      else if (fp) capability = "FINGERPRINT";
      else if (face) capability = "FACE";
      else if (iris) capability = "IRIS";
    }

    const enabled = (await AsyncStorage.getItem(KEY_BIOMETRIC_ENABLED)) === "1";
    return { hardwareAvailable, enrolled, capability, enabled };
  } catch {
    return { hardwareAvailable: false, enrolled: false, capability: "NONE", enabled: false };
  }
}

/** Triggers the OS biometric prompt and resolves true on success. */
export async function authenticateWithBiometrics(
  reason: string = "Unlock FarmerPay",
): Promise<boolean> {
  try {
    const status = await getBiometricStatus();
    if (!status.hardwareAvailable || !status.enrolled) return false;

    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Use password",
      disableDeviceFallback: false, // allow PIN fallback on Android
      fallbackLabel: "Use password",
    });
    return r.success;
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) await AsyncStorage.setItem(KEY_BIOMETRIC_ENABLED, "1");
  else await AsyncStorage.removeItem(KEY_BIOMETRIC_ENABLED);
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY_BIOMETRIC_ENABLED)) === "1";
}

/**
 * Returns a short device-info string suitable for the /auth/login deviceInfo
 * field (≤255 chars). Used by the backend for session audit + suspicious-
 * login detection.
 */
export function getDeviceInfoString(): string {
  const parts: string[] = [];
  parts.push(Platform.OS); // ios | android | web
  parts.push(Platform.Version ? String(Platform.Version) : "?");
  if (Device.brand) parts.push(Device.brand);
  if (Device.modelName) parts.push(Device.modelName);
  if (Device.osName) parts.push(Device.osName);
  if (Device.osVersion) parts.push(Device.osVersion);
  return parts.join(" | ").slice(0, 255);
}
