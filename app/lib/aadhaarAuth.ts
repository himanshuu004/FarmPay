/**
 * Aadhaar Step-Up Auth Helpers
 * Manages Tier-2 Aadhaar session token (15-min TTL) for DICE financial operations.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const AADHAAR_TOKEN_KEY = "fp_aadhaar_token";
const AADHAAR_EXPIRES_KEY = "fp_aadhaar_expires_at";
const AADHAAR_LAST4_KEY = "fp_aadhaar_last4";

export async function setAadhaarSession(token: string, expiresAt: string, last4: string): Promise<void> {
  await AsyncStorage.multiSet([
    [AADHAAR_TOKEN_KEY, token],
    [AADHAAR_EXPIRES_KEY, expiresAt],
    [AADHAAR_LAST4_KEY, last4],
  ]);
}

export async function getAadhaarToken(): Promise<string | null> {
  const token = await AsyncStorage.getItem(AADHAAR_TOKEN_KEY);
  if (!token) return null;
  const expiresAt = await AsyncStorage.getItem(AADHAAR_EXPIRES_KEY);
  if (!expiresAt) return null;
  if (new Date(expiresAt) <= new Date()) {
    await clearAadhaarSession();
    return null;
  }
  return token;
}

export async function getAadhaarLast4(): Promise<string | null> {
  return AsyncStorage.getItem(AADHAAR_LAST4_KEY);
}

export async function getAadhaarExpiresAt(): Promise<Date | null> {
  const s = await AsyncStorage.getItem(AADHAAR_EXPIRES_KEY);
  return s ? new Date(s) : null;
}

export async function isAadhaarVerified(): Promise<boolean> {
  const t = await getAadhaarToken();
  return !!t;
}

export async function getAadhaarTimeLeftSeconds(): Promise<number> {
  const exp = await getAadhaarExpiresAt();
  if (!exp) return 0;
  return Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
}

export async function clearAadhaarSession(): Promise<void> {
  await AsyncStorage.multiRemove([AADHAAR_TOKEN_KEY, AADHAAR_EXPIRES_KEY, AADHAAR_LAST4_KEY]);
}

/**
 * Formats remaining time as "12m 34s" or "< 1m"
 */
export function formatTimeLeft(seconds: number): string {
  if (seconds <= 0) return "expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
