// src/lib/reactions.ts
import { normalizeEmoji } from './emoji';

type Json = Record<string, unknown>;

function getAuthToken(explicit?: string): string {
  if (explicit) return explicit.trim();
  try { return (localStorage.getItem('token') || '').trim(); } catch { return ''; }
}

function jsonOrEmpty(res: Response): Promise<Json> | Promise<{}> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return Promise.resolve({});
  return res.json().catch(() => ({}));
}

async function handle(res: Response) {
  if (!res.ok) {
    let msg = ''; try { msg = await res.text(); } catch {}
    throw new Error(msg || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return {};
  return jsonOrEmpty(res);
}

export async function addReaction(msgId: string, emoji: string, token?: string) {
  const bearer = getAuthToken(token);
  if (!bearer) throw new Error('Missing Authorization header');
  const normalized = normalizeEmoji(emoji);

  const res = await fetch(`/api/chat/messages/${encodeURIComponent(msgId)}/reactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ emoji: normalized }),
    cache: 'no-store',
  });
  return handle(res);
}

export async function removeReaction(msgId: string, emoji: string, token?: string) {
  const bearer = getAuthToken(token);
  if (!bearer) throw new Error('Missing Authorization header');
  const normalized = normalizeEmoji(emoji);

  const res = await fetch(
    `/api/chat/messages/${encodeURIComponent(msgId)}/reactions?emoji=${encodeURIComponent(normalized)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${bearer}` }, cache: 'no-store' }
  );
  return handle(res);
}
