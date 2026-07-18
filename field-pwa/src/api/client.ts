// Base URL matches flutter_app/lib/core/env/env.dart's default — the SAME
// live backend the farmer app and (future) back-office dashboard both use.
// Override via a .env file (VITE_API_BASE_URL) for local backend testing.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'https://farmpay-1l94.onrender.com';
export const API_V1 = `${API_BASE_URL}/api/v1`;

const TOKEN_KEY = 'field_pwa_token';
const REFRESH_KEY = 'field_pwa_refresh_token';
const USER_KEY = 'field_pwa_user';

export type SessionUser = { userId: string; firstName: string; lastName: string | null; mobile: string; role: string };

export const session = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_KEY),
  getUser: (): SessionUser | null => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  set: (token: string, refreshToken: string, user: SessionUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export type ApiResult<T = unknown> = { success: boolean; message?: string; errorCode?: string; data?: T };

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = session.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_V1}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json();
      if (data?.success && data?.data?.accessToken) {
        session.setToken(data.data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(method: string, path: string, body?: unknown, retried = false): Promise<ApiResult> {
  const token = session.getToken();
  const res = await fetch(`${API_V1}${path}`, {
    method,
    headers: {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  if (res.status === 401 && !retried) {
    const refreshed = await tryRefresh();
    if (refreshed) return send(method, path, body, true);
    session.clear();
    window.location.href = '/';
    return { success: false, message: 'Session expired', errorCode: 'UNAUTHORIZED' };
  }
  try {
    return await res.json();
  } catch {
    return { success: false, message: 'Bad response', errorCode: 'PARSE_ERROR' };
  }
}

export const api = {
  get: (path: string) => send('GET', path),
  post: (path: string, body?: unknown) => send('POST', path, body ?? {}),
  postForm: (path: string, form: FormData) => send('POST', path, form),
};
