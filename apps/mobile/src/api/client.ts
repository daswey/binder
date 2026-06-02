import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = 'http://10.0.2.2:3001'; // Android emulator → localhost
// For iOS simulator use: 'http://localhost:3001'
// For real device use your machine's local IP: 'http://192.168.x.x:3001'

const BASE = `${API_URL}/api`;

async function getTokens() {
  const [access, refresh] = await Promise.all([
    AsyncStorage.getItem('access_token'),
    AsyncStorage.getItem('refresh_token'),
  ]);
  return { access, refresh };
}

export async function setTokens(access: string, refresh: string) {
  await Promise.all([
    AsyncStorage.setItem('access_token', access),
    AsyncStorage.setItem('refresh_token', refresh),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    AsyncStorage.removeItem('access_token'),
    AsyncStorage.removeItem('refresh_token'),
  ]);
}

async function refreshAccessToken(): Promise<string | null> {
  const { refresh } = await getTokens();
  if (!refresh) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) { await clearTokens(); return null; }
    const data = await res.json();
    await setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { access } = await getTokens();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (access) headers['Authorization'] = `Bearer ${access}`;

  let res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && access) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw Object.assign(new Error(err.message ?? 'Request failed'), { status: res.status, data: err });
  }

  return res.json();
}

export const apiPost = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const apiPatch = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = <T>(path: string) =>
  apiFetch<T>(path, { method: 'DELETE' });
