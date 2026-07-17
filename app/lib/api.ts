import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAadhaarToken, clearAadhaarSession } from "./aadhaarAuth";

// Server address. In production set EXPO_PUBLIC_API_URL (e.g. https://api.farmerpay.ai)
// when building the app; falls back to localhost for local development.
const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000") + "/api/v1";

// ─── Token Management ───────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem("fp_token");
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem("fp_token", token);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem("fp_refresh_token");
}

export async function setRefreshToken(token: string): Promise<void> {
  await AsyncStorage.setItem("fp_refresh_token", token);
}

export async function clearAllTokens(): Promise<void> {
  await AsyncStorage.multiRemove(["fp_token", "fp_refresh_token", "fp_user"]);
  await clearAadhaarSession();
}

/**
 * Calls /auth/logout to revoke the refresh token server-side, then clears
 * local storage. Best-effort: if the network call fails (offline, expired
 * token), we still nuke local state so the farmer can sign in fresh.
 */
export async function apiLogout(): Promise<void> {
  try {
    const token = await getToken();
    const refreshToken = await getRefreshToken();
    if (token) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
  } finally {
    await clearAllTokens();
  }
}

/**
 * Re-hydrates the locally cached user from /auth/me. Called on app boot
 * after a successful biometric/token check, so the home tab always reflects
 * the latest server-side profile.
 */
export async function apiGetMe(): Promise<any | null> {
  try {
    const r = await apiGet("/auth/me");
    if (r?.success && r?.data) {
      await setUser(r.data);
      return r.data;
    }
  } catch {
    // ignore — caller decides what to do
  }
  return null;
}

export async function clearToken(): Promise<void> {
  await clearAllTokens();
}

export async function getUser(): Promise<any> {
  const u = await AsyncStorage.getItem("fp_user");
  return u ? JSON.parse(u) : null;
}

export async function setUser(user: any): Promise<void> {
  await AsyncStorage.setItem("fp_user", JSON.stringify(user));
}

// ─── Token Refresh ──────────────────────────────────────────────────

let isRefreshing = false;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing) return false;
  isRefreshing = true;
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;
    const res = await fetch(`${API_BASE}/auth/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await res.json();
    if (data.success && data.data?.accessToken) {
      await setToken(data.data.accessToken);
      if (data.data.refreshToken) await setRefreshToken(data.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

// ─── API Methods with Auto-Refresh ──────────────────────────────────

export async function apiGet(path: string): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = await getToken();
      const retry = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      return retry.json();
    }
    throw new Error("UNAUTHORIZED");
  }
  return res.json();
}

export async function apiPost(path: string, body: any): Promise<any> {
  const token = await getToken();
  const headers: any = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = await getToken();
      const retry = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${newToken}` },
        body: JSON.stringify(body),
      });
      return retry.json();
    }
    throw new Error("UNAUTHORIZED");
  }
  return res.json();
}

export async function apiPut(path: string, body: any): Promise<any> {
  const token = await getToken();
  const headers: any = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = await getToken();
      const retry = await fetch(`${API_BASE}${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${newToken}` },
        body: JSON.stringify(body),
      });
      return retry.json();
    }
    throw new Error("UNAUTHORIZED");
  }
  return res.json();
}

export async function apiPatch(path: string, body: any): Promise<any> {
  const token = await getToken();
  const headers: any = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = await getToken();
      const retry = await fetch(`${API_BASE}${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${newToken}` },
        body: JSON.stringify(body),
      });
      return retry.json();
    }
    throw new Error("UNAUTHORIZED");
  }
  return res.json();
}

// ─── DICE / Step-Up API (Tier-2) ────────────────────────────────────
// Attaches x-aadhaar-token header. Throws AADHAAR_STEPUP_REQUIRED on 403
// so the caller can navigate to /aadhaar-verify.

export class StepUpRequiredError extends Error {
  code: string;
  constructor(code: string = "AADHAAR_STEPUP_REQUIRED") {
    super(code);
    this.code = code;
    this.name = "StepUpRequiredError";
  }
}

async function buildStepUpHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getToken();
  const stepUp = await getAadhaarToken();
  const headers: Record<string, string> = { ...extra };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (stepUp) headers["x-aadhaar-token"] = stepUp;
  return headers;
}

function isStepUpError(data: any): boolean {
  const code = data?.errorCode || data?.error?.code;
  return (
    code === "AADHAAR_STEPUP_REQUIRED" ||
    code === "AADHAAR_STEPUP_EXPIRED" ||
    code === "AADHAAR_STEPUP_INVALID" ||
    code === "AADHAAR_STEPUP_USER_MISMATCH"
  );
}

export async function apiDiceGet(path: string): Promise<any> {
  const headers = await buildStepUpHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && isStepUpError(data)) {
    await clearAadhaarSession();
    throw new StepUpRequiredError(data.errorCode);
  }
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return apiDiceGet(path);
    throw new Error("UNAUTHORIZED");
  }
  return data;
}

export async function apiDicePost(path: string, body: any): Promise<any> {
  const headers = await buildStepUpHeaders({ "Content-Type": "application/json" });
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && isStepUpError(data)) {
    await clearAadhaarSession();
    throw new StepUpRequiredError(data.errorCode);
  }
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return apiDicePost(path, body);
    throw new Error("UNAUTHORIZED");
  }
  return data;
}

export async function apiDicePut(path: string, body: any): Promise<any> {
  const headers = await buildStepUpHeaders({ "Content-Type": "application/json" });
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && isStepUpError(data)) {
    await clearAadhaarSession();
    throw new StepUpRequiredError(data.errorCode);
  }
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return apiDicePut(path, body);
    throw new Error("UNAUTHORIZED");
  }
  return data;
}

// ─── Utility ────────────────────────────────────────────────────────

export function formatRupees(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "\u20B90";
  return "\u20B9" + Math.round(n).toLocaleString("en-IN");
}
