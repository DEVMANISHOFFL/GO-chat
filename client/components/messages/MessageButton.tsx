'use client';

import { useRouter } from 'next/navigation';
import { startDM } from '@/app/lib/api';

export function MessageButton({ peerId, label = 'Message' }: { peerId: string; label?: string }) {
  const router = useRouter();

  async function onClick() {
    try {
      const { roomId, peerUsername } = await startDM(peerId);
      const qs = peerUsername ? `?peer=${encodeURIComponent(peerUsername)}` : '';
      router.push(`/dm/${roomId}${qs}`);
    } catch (e: any) {
      alert(e?.message || 'Failed to start DM');
    }
  }

  return (
    <button
      onClick={onClick}
      className="rounded-xl px-3 py-2 bg-violet-600 text-white hover:bg-violet-700"
    >
      {label}
    </button>
  );
}
