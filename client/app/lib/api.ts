export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// app/lib/api.ts
export async function startDM(peerId: string) {
  const api = process.env.NEXT_PUBLIC_API_URL || '';
  const token = (typeof window !== 'undefined' && localStorage.getItem('token')) || '';

  const res = await fetch(`${api}/api/chat/dm/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ peerId }),
  });

  if (!res.ok) {
    throw new Error(`Failed to start DM (${res.status})`);
  }

  // backend returns { roomId, created, peerId?, peerUsername? }
  return res.json() as Promise<{
    roomId: string;
    created?: boolean;
    peerId?: string;
    peerUsername?: string;
  }>;
}


// app/lib/api.ts
export type BasicUser = { id: string; username: string; avatarUrl?: string };

export async function listUsers(q?: string): Promise<BasicUser[]> {
  const api = process.env.NEXT_PUBLIC_API_URL || '';
  const token = (typeof window !== 'undefined' && localStorage.getItem('token')) || '';

  const url = new URL(`${api}/api/chat/users`, window.location.origin);
  if (q && q.trim()) url.searchParams.set('q', q.trim());

  const res = await fetch(url.toString().replace(window.location.origin, ''), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new Error('AUTH'); // not logged in
  }
  if (!res.ok) throw new Error(`Failed to fetch users (${res.status})`);
  return res.json();
}


// app/lib/api.ts
export type RoomLite = { id: string; name: string; topic?: string; uuid?: string };

export async function listRooms(limit = 50): Promise<RoomLite[]> {
  const api = process.env.NEXT_PUBLIC_API_URL || '';
  const token = (typeof window !== 'undefined' && localStorage.getItem('token')) || '';
  const url = new URL(`${api}/api/chat/rooms`, window.location.origin);
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString().replace(window.location.origin, ''), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('AUTH');
  if (!res.ok) throw new Error(`rooms ${res.status}`);
  const data = await res.json();
  return (data as any[]).map((r) => ({
    id: r.id || r.roomId || r.RoomID || r.slug || String(r.id),
    name: r.name || r.Name || 'room',
    topic: r.topic || r.Topic || '',
    uuid: r.uuid || r.RoomID || r.id || r.roomId,
  }));
}
