// src/app/AppShell.tsx
'use client';

import React, { PropsWithChildren, useEffect, useMemo, useState } from 'react';

import LeftNav from './LeftNav';
import ChannelNav from './ChannelNav';
import HeaderBar from './HeaderBar';
import RightPanel from './RightPanel';
import MobileDrawer from './MobileDrawer';
import QuickSwitcher from '@/components/overlays/QuickSwitcher';
import MessageList from '@/components/messages/MessageList';
import TypingIndicator from '@/components/messages/TypingIndicator';
import Composer from '@/components/messages/Composer';
import ConnectionBanner from '@/components/primitives/ConnectionBanner';

import type { Room, Message } from '@/lib/types';
import { wsManager } from '@/lib/ws';
import type { WSStatus } from '@/lib/ws-types';
import { makeTempId } from '@/lib/tempId';


type MessagesByRoom = Record<string, Message[]>;
type TypersMap = Record<string, string>;

type ApiMessageDb = {
    roomId: string;     // UUID in DB
    msgId: string;      // timeuuid
    userId: string;     // USER UUID
    username: string;   // <- server should send this
    content: string;
    createdAt: string | number; // accept ISO or ms; we normalize later
};

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();


function mapDbToMessage(m: ApiMessageDb): Message {
    return {
        id: String(m.msgId),
        roomId: String(m.roomId),
        author: {
            id: String(m.userId),
            username: m.username ? String(m.username) : String(m.userId).slice(0, 8),
        },
        content: String(m.content),
        createdAt: m.createdAt,
    };
}

function getMeFromToken(): { id: string; username: string } | null {
    try {
        const t = localStorage.getItem('token');
        if (!t) return null;
        const c = JSON.parse(atob(t.split('.')[1]));
        const id = c.user_id || c.userId;
        if (!id) return null;
        const username = c.username || c.name || c.email?.split?.('@')?.[0] || String(id).slice(0, 8);
        return { id: String(id), username: String(username) };
    } catch {
        return null;
    }
}

function applyInsert(arr: Message[], m: Message) {
    const idx = arr.findIndex((x) => x.id === m.id);
    const next = idx >= 0 ? [...arr] : [...arr, m];
    if (idx >= 0) next[idx] = m;
    next.sort((a, b) => +new Date(a.createdAt as any) - +new Date(b.createdAt as any));
    return next;
}

function buildWsUrl(roomJoinId: string) {
    const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
    const base = new URL(baseRaw, window.location.origin);
    base.search = '';
    const url = new URL(base.toString());
    const token = (localStorage.getItem('token') || '').trim();
    if (token) url.searchParams.set('token', token);
    url.searchParams.set('room_id', roomJoinId);
    const final = url.toString();
    console.log('[WS][build]', { baseRaw, tokenPresent: !!token, final });
    return final;
}

export default function AppShell({
    rooms,
    currentRoomId, // slug like "general"
    onSelectRoom,
    children,
}: PropsWithChildren & {
    rooms: Room[];
    currentRoomId: string;
    onSelectRoom: (id: string) => void;
}) {
    const [rightOpen, setRightOpen] = useState(false);
    const [qsOpen, setQsOpen] = useState(false);
    const [typers, setTypers] = useState<TypersMap>({});
    const [status, setStatus] = useState<WSStatus>('offline');
    const [messagesByRoom, setMessagesByRoom] = useState<MessagesByRoom>({});

    // derive me after mount, then render the list (prevents first-paint flip)
    const [me, setMe] = useState<{ id: string; username: string } | null>(null);
    useEffect(() => {
        setMe(getMeFromToken());
    }, []);
    const meReady = !!me?.id;

    // Build maps between slug <-> uuid for reliable normalization
    const { active, uuidToSlug } = useMemo(() => {
        const uuidToSlug = new Map<string, string>();
        for (const r of rooms) {
            const slug = r.id;
            const uuid = (r as any).uuid as string | undefined;
            if (uuid) uuidToSlug.set(uuid, slug);
        }
        return { active: rooms.find((r) => r.id === currentRoomId), uuidToSlug };
    }, [rooms, currentRoomId]);

    // Normalize any incoming room identifier (UUID or slug) to the visible slug key
    const normalizeKey = (rid: string) => uuidToSlug.get(rid) || rid;

    const items = messagesByRoom[currentRoomId] || [];

    // 1) Load history (prefer UUID) — only after me is known
    useEffect(() => {
        if (!meReady) return;
        const ctrl = new AbortController();
        (async () => {
            try {
                const token = (localStorage.getItem('token') || '').trim();
                const historyRoomId =
                    ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;

                const apiBase = process.env.NEXT_PUBLIC_API_URL || ''; // '' = Next proxy
                const url = `${apiBase}/api/chat/rooms/${encodeURIComponent(historyRoomId)}/messages?limit=50`;

                const res = await fetch(url, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    signal: ctrl.signal,
                    cache: 'no-store',
                });

                if (!res.ok) {
                    console.warn('[History] HTTP', res.status, await res.text().catch(() => ''));
                    setMessagesByRoom((prev) => ({ ...prev, [currentRoomId]: prev[currentRoomId] || [] }));
                    return;
                }

                const raw: ApiMessageDb[] = await res.json();
                raw.sort((a, b) => +new Date(a.createdAt as any) - +new Date(b.createdAt as any));
                const bucketKey = normalizeKey(historyRoomId);
                setMessagesByRoom((prev) => ({ ...prev, [bucketKey]: raw.map(mapDbToMessage) }));
            } catch (e: any) {
                if (e?.name !== 'AbortError') console.warn('[History] load failed:', e);
            }
        })();
        return () => ctrl.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meReady, currentRoomId, (active as any)?.uuid, active?.id]);

    // 2) WebSocket lifecycle — only after me is known
    useEffect(() => {
        if (!meReady) return;
        const joinId =
            ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;

        const wsUrl = buildWsUrl(joinId);
        console.log('[AppShell] WS connect for room', { currentRoomId, joinId, wsUrl });
        wsManager.connect(wsUrl);

        setStatus(wsManager.getStatus());
        const unsubStatus = wsManager.onStatus((s) => setStatus(s));

        const unsubEvent = wsManager.onEvent((ev: any) => {
            const p = ev?.payload ?? ev?.data ?? {};
            switch (ev.type) {
                case 'hello':
                case 'conn.ack':
                    break;

                case 'message.created': {
                    // Normalize WS payload into { id, roomId, author: { id, username }, ... }
                    const id = String(p.id ?? p.msgId ?? makeTempId());
                    const roomId = String(p.roomId ?? joinId);
                    const createdAt = p.createdAt ?? new Date().toISOString();
                    const bucket = normalizeKey(roomId);

                    const authorId = String(p.author?.id ?? p.userId ?? p.user_id ?? 'unknown');
                    const username = String(p.author?.username ?? p.author?.name ?? 'Unknown');

                    const nextMsg: Message = {
                        id,
                        roomId,
                        author: { id: authorId, username },
                        content: String(p.content ?? ''),
                        createdAt,
                    };

                    setMessagesByRoom((prev) => {
                        const list = prev[bucket] || [];
                        const tempIdx = p.tempId ? list.findIndex((m) => m.id === p.tempId) : -1;
                        if (tempIdx >= 0) {
                            const next = [...list];
                            next[tempIdx] = nextMsg;
                            next.sort((a, b) => +new Date(a.createdAt as any) - +new Date(b.createdAt as any));
                            return { ...prev, [bucket]: next };
                        }
                        return { ...prev, [bucket]: applyInsert(list, nextMsg) };
                    });
                    break;
                }

                case 'typing.start': {
                    const roomKey = normalizeKey(String(p.roomId));
                    if (roomKey !== currentRoomId) return;
                    const name = String(p.name ?? p.username ?? 'Someone');
                    setTypers((prev) => (prev[p.userId] ? prev : { ...prev, [p.userId]: name }));
                    break;
                }

                case 'typing.stop': {
                    const roomKey = normalizeKey(String(p.roomId));
                    if (roomKey !== currentRoomId) return;
                    setTypers((prev) => {
                        const { [p.userId]: _, ...rest } = prev;
                        return rest;
                    });
                    break;
                }

                default:
                    break;
            }
        });

        setTypers({}); // reset when switching rooms

        return () => {
            unsubStatus();
            unsubEvent();
            wsManager.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meReady, currentRoomId, (active as any)?.uuid, active?.id]);

    // --- send helpers ---
    const sendMessage = (roomIdVisibleSlugOrUuid: string, content: string) => {
        if (!meReady || !me) return;

        const tempId = makeTempId();
        const joinId =
            ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId; // server expects this
        const visibleBucket = currentRoomId; // store under slug for UI

        // optimistic insert
        setMessagesByRoom((prev) => ({
            ...prev,
            [visibleBucket]: applyInsert(prev[visibleBucket] || [], {
                id: tempId,
                roomId: joinId,
                author: me, // { id, username }
                content,
                createdAt: new Date().toISOString(),
            }),
        }));

        wsManager.send({
            type: 'message.send',
            payload: { tempId, roomId: joinId, content },
        } as any);
    };

    const joinKey =
        ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;
    const typingNames = Object.values(typers);

    return (
        <div className="flex h-dvh w-full bg-background text-foreground">
            <div className="absolute left-0 right-0 top-0">
                <ConnectionBanner status={status} />
            </div>

            <LeftNav onOpenSettings={() => alert('Settings TBD')} onOpenQuickSwitcher={() => setQsOpen(true)} />
            <ChannelNav rooms={rooms} activeId={currentRoomId} onSelect={onSelectRoom} />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-14 items-center gap-2 border-b bg-background px-2 md:px-3">
                    <MobileDrawer rooms={rooms} activeId={currentRoomId} onSelect={onSelectRoom} />
                    <HeaderBar
                        title={`# ${active?.name ?? 'room'}`}
                        subtitle={active?.topic}
                        onSearch={() => setQsOpen(true)}
                        onOpenRightPanel={() => setRightOpen(true)}
                    />
                </div>

                {/* Gate list until identity is known to avoid side flips */}
                {meReady ? <MessageList items={items} meId={me!.id} /> : <div className="flex-1" />}

                <TypingIndicator names={typingNames} />
                <Composer
                    roomId={currentRoomId}
                    placeholder={`Message # ${active?.name ?? ''}`}
                    onTypingStart={() =>
                        wsManager.send({
                            type: 'typing.start',
                            to: joinKey,
                            payload: { roomId: joinKey, userId: me?.id ?? 'anon', name: me?.username ?? 'you' },
                        } as any)
                    }
                    onTypingStop={() =>
                        wsManager.send({
                            type: 'typing.stop',
                            to: joinKey,
                            payload: { roomId: joinKey, userId: me?.id ?? 'anon' },
                        } as any)
                    }
                    onSend={({ text }) => sendMessage(joinKey, text)}
                />
            </div>

            <RightPanel open={rightOpen} onClose={() => setRightOpen(false)} />
            <QuickSwitcher open={qsOpen} onOpenChange={setQsOpen} />
            {children}
        </div>
    );
}
