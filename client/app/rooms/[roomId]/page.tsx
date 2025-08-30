'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';

type RoomLite = { id: string; name: string; topic?: string; uuid?: string };

async function listRooms(limit = 200): Promise<RoomLite[]> {
  const api = process.env.NEXT_PUBLIC_API_URL || '';
  const token = localStorage.getItem('token') || '';
  const url = new URL(`${api}/api/chat/rooms`, window.location.origin);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString().replace(window.location.origin, ''), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data as any[]).map((r) => ({
    id: String(r.id ?? r.roomId ?? r.RoomID ?? r.slug),
    name: String(r.name ?? r.Name ?? r.slug ?? 'room'),
    topic: r.topic ?? r.Topic ?? '',
    uuid: String(r.uuid ?? r.RoomID ?? r.id ?? r.roomId ?? ''),
  }));
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomLite[]>([]);

  useEffect(() => {
    (async () => {
      const all = await listRooms(200);
      setRooms(all);
      // soft-guard: if current roomId doesn’t exist, go first
      if (all.length && !all.some(r => r.id === roomId)) {
        router.replace(`/rooms/${all[0].id}`);
      }
    })();
  }, [roomId, router]);

  return (
    <AppShell
      rooms={rooms.length ? rooms : [{ id: 'loading', name: 'Loading…' }]}
      currentRoomId={roomId}
      onSelectRoom={(id) => router.push(`/rooms/${id}`)}
    />
  );
}
