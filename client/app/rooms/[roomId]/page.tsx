'use client';
import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { MOCK_ROOMS, getRoomById } from '@/lib/rooms';


export default function RoomPage() {
    const params = useParams<{ roomId: string }>();
    const router = useRouter();
    const roomId = params.roomId;


    // If room is unknown, push to /rooms/general
    const room = useMemo(() => getRoomById(roomId), [roomId]);
    if (!room) {
        // Avoid flash by hard-redirecting to a known route
        router.replace('/rooms/general');
        return null;
    }


    return (
        <AppShell
            rooms={MOCK_ROOMS}
            currentRoomId={roomId}
            onSelectRoom={(id) => router.push(`/rooms/${encodeURIComponent(id)}`)}
        />
    );
}