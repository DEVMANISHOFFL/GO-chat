'use client';

import { useEffect, useMemo, useState } from 'react';
import { listUsers } from '@/app/lib/api';
import { MessageButton } from '../messages/MessageButton';

function avatarFor(seedLike: string) {
  const seed = encodeURIComponent(seedLike || 'user');
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundType=gradientLinear`;
}

export default function UsersPanel() {
  const [users, setUsers] = useState<Array<{ id: string; username: string; avatarUrl?: string }>>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const data = await listUsers();
        if (!stop) setUsers(data);
      } catch (e: any) {
        if (!stop) {
          if (e?.message === 'AUTH') setAuthNeeded(true);
          console.warn('users load failed', e);
        }
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return users;
    return users.filter(
      (u) =>
        u.username?.toLowerCase().includes(qq) ||
        u.id.toLowerCase().includes(qq)
    );
  }, [users, q]);

  // 🔥 if login required
  if (authNeeded) {
    return (
      <div className="w-full max-w-3xl mx-auto p-4">
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            You need to be signed in to see people. Please log in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground">No users found.</div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={u.avatarUrl || avatarFor(u.username || u.id)}
                  alt={u.username}
                  className="h-10 w-10 rounded-full ring-2 ring-background"
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">@{u.username || u.id.slice(0, 8)}</div>
                  <div className="truncate text-xs text-muted-foreground">{u.id}</div>
                </div>
              </div>

              {/* This triggers the DM creation + navigate */}
              <MessageButton peerId={u.id} label="Message" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
