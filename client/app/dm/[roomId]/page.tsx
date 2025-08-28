'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';

async function fetchPeer(roomId: string) {
  try {
    const api = process.env.NEXT_PUBLIC_API_URL || '';
    const token = localStorage.getItem('token') || '';
    const r = await fetch(`${api}/api/chat/rooms/${roomId}/peer`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!r.ok) return null;
    return r.json() as Promise<{ id: string; username: string }>;
  } catch {
    return null;
  }
}

export default function DMPage() {
  const p = useParams<{ roomId: string }>();
  const roomId = p.roomId;

  const params = useSearchParams();
  const peerFromQS = params.get('peer') || undefined;
  const [peerName, setPeerName] = useState(peerFromQS || 'Direct Message');

  useEffect(() => {
    if (peerFromQS || !roomId) return;
    fetchPeer(roomId).then((p) => p && p.username && setPeerName(p.username));
  }, [peerFromQS, roomId]);

  const dmRoom = useMemo(
    () => ({ id: roomId, name: peerName, topic: 'Private DM' }),
    [roomId, peerName]
  );

  return (
    <AppShell
      rooms={[dmRoom]}
      currentRoomId={roomId}
      onSelectRoom={(id) => {
        console.log('select room', id);
      }}
    />
  );
}
