import { getToken, getRefreshToken, saveAuthBundle, clearTokens } from './session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

type RefreshResp = {
  token: string;
  refresh_token: string;
  expires_at: number;
};

export async function attemptRefresh(): Promise<RefreshResp | null> {
  const token = getToken();
  const refresh = getRefreshToken();
  if (!token || !refresh) return null;

  const res = await fetch(`${API_BASE}/api/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`, // NOTE: must still be valid
    },
    body: JSON.stringify({ refresh_token: refresh }),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as RefreshResp;
  saveAuthBundle(data);
  return data;
}

export function logoutToLogin() {
  clearTokens();
  window.location.href = '/login';
}
