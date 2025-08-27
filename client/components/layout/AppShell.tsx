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
import LogoutButton from '../auth/LogoutButton';

type MessagesByRoom = Record<string, Message[]>;
type TypersMap = Record<string, string>;

function extractParentId(p: any): string | undefined {
    const raw =
        p?.parentId ??
        p?.parent_id ??
        p?.parent_msg_id ??
        p?.reply_to ??
        p?.parent ??
        p?.meta?.parentId ??
        p?.meta?.parent_id;

    if (!raw) return undefined;
    if (typeof raw === 'string') return raw;

    // Common nested shapes from APIs
    return (
        raw?.id ??
        raw?.msgId ??
        raw?.messageId ??
        raw?.message_id ??
        raw?.parentId ??
        raw?.parent_id ??
        undefined
    );
}




type ApiMessageDb = {
    roomId: string;
    msgId: string;
    userId: string;
    username: string;
    content: string;
    createdAt: string | number;
    // may include parent field in various shapes
    parentId?: string;
    parent_msg_id?: string;
};

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

async function editMessageREST(roomId: string, msgId: string, content: string) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    const token = (localStorage.getItem('token') || '').trim();
    const res = await fetch(
        `${apiBase}/api/chat/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(
            msgId
        )}`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...(!!token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ content }),
        }
    );
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    return res.json();
}

async function deleteMessageREST(roomId: string, msgId: string, reason?: string) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    const token = (localStorage.getItem('token') || '').trim();
    const url = new URL(
        `${apiBase}/api/chat/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(
            msgId
        )}`,
        window.location.origin
    );
    if (reason && reason.trim()) url.searchParams.set('reason', reason.trim());
    const res = await fetch(url.toString().replace(window.location.origin, ''), {
        method: 'DELETE',
        headers: {
            ...(!!token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    return res.json();
}

function mapDbToMessage(m: ApiMessageDb): Message {
    const rawParent = (m as any).parent ?? (m as any).reply_to ?? null;
    const parentId =
        (m as any).parentId ??
        (m as any).parent_id ??
        (m as any).parent_msg_id ??
        (typeof rawParent === 'string'
            ? rawParent
            : rawParent?.id ?? rawParent?.msgId ?? rawParent?.messageId);

    return {
        id: String(m.msgId),
        roomId: String(m.roomId),
        author: {
            id: String(m.userId),
            username: m.username ? String(m.username) : String(m.userId).slice(0, 8),
        },
        content: String(m.content),
        createdAt: m.createdAt,
        editedAt: (m as any).editedAt,
        deletedAt: (m as any).deletedAt,
        deletedBy: (m as any).deletedBy,
        deletedReason: (m as any).deletedReason,
        parentId: extractParentId(m)
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
    currentRoomId,
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
    const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);

    const [me, setMe] = useState<{ id: string; username: string } | null>(null);
    useEffect(() => {
        setMe(getMeFromToken());
    }, []);
    const meReady = !!me?.id;

    const { active, uuidToSlug } = useMemo(() => {
        const uuidToSlug = new Map<string, string>();
        for (const r of rooms) {
            const slug = r.id;
            const uuid = (r as any).uuid as string | undefined;
            if (uuid) uuidToSlug.set(uuid, slug);
        }
        return { active: rooms.find((r) => r.id === currentRoomId), uuidToSlug };
    }, [rooms, currentRoomId]);

    const normalizeKey = (rid: string) => uuidToSlug.get(rid) || rid;

    const items = messagesByRoom[currentRoomId] || [];

    useEffect(() => {
        if (!meReady) return;
        const ctrl = new AbortController();
        (async () => {
            try {
                const token = (localStorage.getItem('token') || '').trim();
                const historyRoomId =
                    ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;

                const apiBase = process.env.NEXT_PUBLIC_API_URL || ''; // '' = Next proxy
                const url = `${apiBase}/api/chat/rooms/${encodeURIComponent(
                    historyRoomId
                )}/messages?limit=50`;

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
                raw.sort(
                    (a, b) => +new Date(a.createdAt as any) - +new Date(b.createdAt as any)
                );
                const bucketKey = normalizeKey(historyRoomId);
                setMessagesByRoom((prev) => ({ ...prev, [bucketKey]: raw.map(mapDbToMessage) }));
            } catch (e: any) {
                if (e?.name !== 'AbortError') console.warn('[History] load failed:', e);
            }
        })();
        return () => ctrl.abort();
    }, [meReady, currentRoomId, (active as any)?.uuid, active?.id]);

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

            if (ev.type === 'message.created') {
                console.log('[WS raw message.created]', JSON.stringify(p, null, 2));
            }

            switch (ev.type) {
                case 'hello':
                case 'conn.ack':
                    break;

                case 'message.created': {

                    const rawParent = (p as any).parent ?? (p as any).reply_to ?? null;
                    const parentId =
                        (p as any).parentId ??
                        (p as any).parent_id ??
                        (p as any).parent_msg_id ??
                        (typeof rawParent === 'string'
                            ? rawParent
                            : rawParent?.id ?? rawParent?.msgId ?? rawParent?.messageId);
                    const { id, tempId, roomId, author, content, createdAt } = p;
                    const bucket = normalizeKey(String(roomId));

                    const safeAuthor = {
                        id: String(author?.id ?? p.userId ?? p.user_id ?? 'unknown'),
                        username: String(author?.username ?? author?.name ?? 'Unknown'),
                    };

                    const nextMsg: Message = {
                        id: String(id),
                        roomId: String(roomId),
                        author: safeAuthor,
                        content: String(content ?? ''),
                        createdAt: createdAt ?? new Date().toISOString(),
                        parentId: extractParentId(p),
                    };

                    setMessagesByRoom((prev) => {
                        const list = prev[bucket] || [];

                        const i = tempId ? list.findIndex((m) => m.id === tempId) : -1;
                        if (i >= 0) {
                            const prior = list[i];
                            const merged: Message = {
                                ...prior,            // keep optimistic fields
                                ...nextMsg,          // server wins where present
                                parentId: nextMsg.parentId ?? prior.parentId, // ✅ preserve if server omitted
                            };
                            const next = [...list];
                            next[i] = merged;
                            next.sort((a, b) => +new Date(a.createdAt as any) - +new Date(b.createdAt as any));
                            return { ...prev, [bucket]: next };
                        }


                        return { ...prev, [bucket]: applyInsert(list, nextMsg) };
                    });
                    break;
                }

                case 'message.updated': {
                    const { id, roomId, content, editedAt } = p;
                    const bucket = normalizeKey(String(roomId));
                    setMessagesByRoom((prev) => {
                        const list = prev[bucket] || [];
                        const i = list.findIndex((m) => m.id === String(id));
                        if (i < 0) return prev;
                        const next = [...list];
                        next[i] = {
                            ...next[i],
                            content: String(content ?? ''),
                            editedAt: editedAt ?? new Date().toISOString(),
                        };
                        return { ...prev, [bucket]: next };
                    });
                    break;
                }

                case 'message.deleted': {
                    const { id, roomId, deletedAt, deletedBy, deletedReason } = p;
                    const bucket = normalizeKey(String(roomId));
                    setMessagesByRoom((prev) => {
                        const list = prev[bucket] || [];
                        const i = list.findIndex((m) => m.id === String(id));
                        if (i < 0) return prev;
                        const next = [...list];
                        next[i] = {
                            ...next[i],
                            deletedAt: deletedAt ?? new Date().toISOString(),
                            deletedBy: deletedBy,
                            deletedReason: deletedReason,
                        };
                        return { ...prev, [bucket]: next };
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

        setTypers({});

        return () => {
            unsubStatus();
            unsubEvent();
            wsManager.disconnect();
        };
    }, [meReady, currentRoomId, (active as any)?.uuid, active?.id]);

    // --- send helpers ---
    const sendMessage = (
        roomIdVisibleSlugOrUuid: string,
        content: string,
        parentId?: string
    ) => {
        if (!meReady || !me) return;

        const tempId = makeTempId();
        const joinId =
            ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;
        const visibleBucket = currentRoomId;

        setMessagesByRoom((prev) => ({
            ...prev,
            [visibleBucket]: applyInsert(prev[visibleBucket] || [], {
                id: tempId,
                roomId: joinId,
                author: me,
                content,
                createdAt: new Date().toISOString(),
                parentId, // ✅ keep on optimistic row
            }),
        }));

        wsManager.send({
            type: 'message.send',
            payload: { tempId, roomId: joinId, content, parentId }, // ✅ include in WS
        } as any);

        setReplyingTo(null);
    };

    const handleEditMessage = async (msg: Message, nextContent: string) => {
        try {
            if (me?.id !== msg.author?.id) return alert('You can only edit your message.');
            const roomKey =
                ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;

            setMessagesByRoom((prev) => {
                const bucket = currentRoomId;
                const list = prev[bucket] || [];
                const i = list.findIndex((m) => m.id === msg.id);
                if (i < 0) return prev;
                const nextList = [...list];
                nextList[i] = {
                    ...nextList[i],
                    content: nextContent,
                    editedAt: new Date().toISOString(),
                };
                return { ...prev, [bucket]: nextList };
            });

            await editMessageREST(roomKey, msg.id, nextContent);
        } catch (e) {
            console.warn('[Edit] failed', e);
            alert('Edit failed.');
        }
    };

    const handleDeleteMessage = async (msg: Message) => {
        try {
            if (me?.id !== msg.author?.id) return;
            const roomKey =
                ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;

            setMessagesByRoom((prev) => {
                const bucket = currentRoomId;
                const list = prev[bucket] || [];
                const i = list.findIndex((m) => m.id === msg.id);
                if (i < 0) return prev;
                const now = new Date().toISOString();
                const nextList = [...list];
                nextList[i] = {
                    ...nextList[i],
                    deletedAt: now,
                    deletedBy: me?.id,
                    deletedReason: 'user_delete',
                };
                return { ...prev, [bucket]: nextList };
            });

            await deleteMessageREST(roomKey, msg.id, 'user_delete');
        } catch (e) {
            // swallow for now
        }
    };

    const joinKey =
        ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;
    const typingNames = Object.values(typers);

    return (
        <div className="flex h-dvh w-full bg-background text-foreground">
            <div className="absolute left-0 right-0 top-0">
                <ConnectionBanner status={status} />
            </div>

            <LeftNav
                onOpenSettings={() => alert('Settings TBD')}
                onOpenQuickSwitcher={() => setQsOpen(true)}
            />
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
                    <div className="ml-auto">
                        <LogoutButton />
                    </div>
                </div>

                {meReady ? (
                    <MessageList
                        items={items}
                        meId={me!.id}
                        onEditMessage={handleEditMessage}
                        onDeleteMessage={handleDeleteMessage}
                        editingMessageId={editingMessageId}
                        onRequestEdit={(id) => setEditingMessageId(id)}
                        onEndEdit={() => setEditingMessageId(null)}
                        onReply={(msg) => setReplyingTo(msg)}
                    />
                ) : (
                    <div className="flex-1" />
                )}

                <TypingIndicator names={typingNames} />
                <Composer
                    roomId={currentRoomId}

                    placeholder={`Message # ${active?.name ?? ''}`}
                    onTypingStart={() =>
                        wsManager.send({
                            type: 'typing.start',
                            to: joinKey,
                            payload: {
                                roomId: joinKey,
                                userId: me?.id ?? 'anon',
                                name: me?.username ?? 'you',
                            },
                        } as any)
                    }
                    onTypingStop={() =>
                        wsManager.send({
                            type: 'typing.stop',
                            to: joinKey,
                            payload: { roomId: joinKey, userId: me?.id ?? 'anon' },
                        } as any)
                    }
                    onSend={({ text }) => sendMessage(joinKey, text, replyingTo?.id)} // 👈 pass it here
                    replyingTo={replyingTo}
                    onCancelReply={() => setReplyingTo(null)}
                />
            </div>

            <RightPanel open={rightOpen} onClose={() => setRightOpen(false)} />
            <QuickSwitcher open={qsOpen} onOpenChange={setQsOpen} />
            {children}
        </div>
    );
}
