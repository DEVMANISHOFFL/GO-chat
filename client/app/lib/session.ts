export type StoredAuth = {
  token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
};

export function saveTokens(token: string, refresh: string, expires_at?: number) {
  localStorage.setItem('token', token);
  localStorage.setItem('refresh_token', refresh);
  if (expires_at) localStorage.setItem('expires_at', String(expires_at));
}

export function saveAuthBundle({ token, refresh_token, expires_at }: StoredAuth) {
  saveTokens(token, refresh_token, expires_at);
}

export function getToken() {
  return localStorage.getItem('token') || '';
}

export function getRefreshToken() {
  return localStorage.getItem('refresh_token') || '';
}

export function getExpiresAt(): number | null {
  const raw = localStorage.getItem('expires_at');
  return raw ? Number(raw) : null;
}

export function clearTokens() {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('expires_at');
}
