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
  userId: string;
  content: string;
  createdAt: string;  // ISO
};

function mapDbToMessage(m: ApiMessageDb): Message {
  return {
    id: m.msgId,
    roomId: m.roomId,
    author: { id: m.userId, name: m.userId?.slice(0, 8) || 'Unknown' },
    content: m.content,
    createdAt: m.createdAt,
  };
}

function getMeFromToken() {
  try {
    const t = localStorage.getItem('token');
    if (!t) return null;
    const c = JSON.parse(atob(t.split('.')[1]));
    const id = c.user_id || c.userId;
    if (!id) return null;
    return { id, name: (c.name || String(id).slice(0, 8)) };
  } catch {
    return null;
  }
}

function applyInsert(arr: Message[], m: Message) {
  const idx = arr.findIndex((x) => x.id === m.id);
  if (idx >= 0) {
    const next = [...arr];
    next[idx] = m;
    return next;
  }
  const next = [...arr, m];
  next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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

  // Always use real me from token (fallback to anon)
  const me = useMemo(() => getMeFromToken() ?? { id: 'anon', name: 'You' }, []);

  // Build maps between slug <-> uuid for reliable normalization
  const { active, uuidToSlug, slugToUuid } = useMemo(() => {
    const bySlug = new Map<string, Room>();
    const uuidToSlug = new Map<string, string>();
    const slugToUuid = new Map<string, string>();

    for (const r of rooms) {
      // Assume r.id is slug used in URLs; r.uuid may exist on your Room type
      const slug = r.id;
      const uuid = (r as any).uuid as string | undefined;
      bySlug.set(slug, r);
      if (uuid) {
        uuidToSlug.set(uuid, slug);
        slugToUuid.set(slug, uuid);
      }
    }
    return {
      active: rooms.find((r) => r.id === currentRoomId),
      uuidToSlug,
      slugToUuid,
    };
  }, [rooms, currentRoomId]);

  // Normalize any incoming room identifier (UUID or slug) to the visible slug key
  const normalizeKey = (rid: string) => uuidToSlug.get(rid) || rid;

  const items = messagesByRoom[currentRoomId] || [];

  // 1) Load history (prefer UUID if available)
  useEffect(() => {
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
          // Ensure we at least create an empty bucket for this room
          setMessagesByRoom((prev) => ({
            ...prev,
            [currentRoomId]: prev[currentRoomId] || [],
          }));
          return;
        }

        const raw: ApiMessageDb[] = await res.json();
        raw.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

        // Store under the slug key that the UI uses (normalize)
        const bucketKey = normalizeKey(historyRoomId);
        setMessagesByRoom((prev) => ({ ...prev, [bucketKey]: raw.map(mapDbToMessage) }));
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.warn('[History] load failed:', e);
      }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoomId, (active as any)?.uuid, active?.id]);

  // 2) WebSocket lifecycle (connect once per room change, prefer UUID for join)
  useEffect(() => {
    const joinId =
      ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId;

    const wsUrl = buildWsUrl(joinId);
    console.log('[AppShell] WS connect for room', { currentRoomId, joinId, wsUrl });
    wsManager.connect(wsUrl);

    setStatus(wsManager.getStatus());
    const unsubStatus = wsManager.onStatus((s) => {
      console.log('[WS][status]', s);
      setStatus(s);
    });

    const unsubEvent = wsManager.onEvent((ev: any) => {
      const p = ev?.payload ?? ev?.data ?? {};
      console.log('[WS][event]', ev);

      switch (ev.type) {
        case 'hello':
        case 'conn.ack':
          break;

        case 'message.created': {
          const { id, tempId, roomId, author, content, createdAt } = p;
          const bucket = normalizeKey(roomId);
          const safeAuthor = author ?? { id: 'unknown', name: 'Unknown' };
          setMessagesByRoom((prev) => {
            const list = prev[bucket] || [];
            // If an optimistic temp message exists, replace it; else insert
            const tempIdx = tempId ? list.findIndex((m) => m.id === tempId) : -1;
            const nextMsg: Message = {
              id,
              roomId,
              author: safeAuthor,
              content,
              createdAt,
            };

            if (tempIdx >= 0) {
              const next = [...list];
              next[tempIdx] = nextMsg;
              return { ...prev, [bucket]: next };
            }
            return { ...prev, [bucket]: applyInsert(list, nextMsg) };
          });
          break;
        }

        case 'typing.start': {
          const roomKey = normalizeKey(p.roomId);
          if (roomKey !== currentRoomId) return;
          setTypers((prev) =>
            prev[p.userId] ? prev : { ...prev, [p.userId]: p.name || 'Someone' }
          );
          break;
        }

        case 'typing.stop': {
          const roomKey = normalizeKey(p.roomId);
          if (roomKey !== currentRoomId) return;
          setTypers((prev) => {
            const { [p.userId]: _, ...rest } = prev;
            return rest;
          });
          break;
        }

        // Optionally handle updates/deletes later
        case 'message.updated':
        case 'message.deleted':
        default:
          break;
      }
    });

    setTypers({}); // reset when switching rooms

    return () => {
      console.log('[AppShell] WS cleanup');
      unsubStatus();
      unsubEvent();
      wsManager.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoomId, (active as any)?.uuid, active?.id]);

  // --- send helpers ---
  const sendMessage = (roomIdVisibleSlugOrUuid: string, content: string) => {
    const tempId = makeTempId();
    const joinId =
      ((active as any)?.uuid as string | undefined) || active?.id || currentRoomId; // what server expects (UUID if present)
    const visibleBucket = currentRoomId; // always store under slug for UI

    // optimistic insert under the slug bucket, using real me
    setMessagesByRoom((prev) => ({
      ...prev,
      [visibleBucket]: applyInsert(prev[visibleBucket] || [], {
        id: tempId,
        roomId: joinId,
        author: me,
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
        </div>

        <MessageList items={items} meId={me.id} />

        <TypingIndicator names={typingNames} />
        <Composer
          roomId={currentRoomId}
          placeholder={`Message # ${active?.name ?? ''}`}
          onTypingStart={() =>
            wsManager.send({
              type: 'typing.start',
              to: joinKey,
              payload: { roomId: joinKey, userId: me.id, name: me.name },
            } as any)
          }
          onTypingStop={() =>
            wsManager.send({
              type: 'typing.stop',
              to: joinKey,
              payload: { roomId: joinKey, userId: me.id },
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
