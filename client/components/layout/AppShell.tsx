'use client';

import React, {
  PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from 'react';

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
import type { ServerEvent, WSStatus } from '@/lib/ws-types';
import { makeTempId } from '@/lib/tempId';

const ME = { id: 'me', name: 'You' };

type MessagesByRoom = Record<string, Message[]>;
type TypersMap = Record<string, string>;

function applyInsert(arr: Message[], m: Message) {
  const idx = arr.findIndex((x) => x.id === m.id);
  if (idx >= 0) {
    const next = [...arr];
    next[idx] = m;
    return next;
  }
  return [...arr, m].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

/** Build WS URL from env + token; append room_id safely */
function buildWsUrl(roomId?: string) {
  const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
  console.log('[WS][build] baseRaw =', baseRaw);

  // Strip accidental queries from env
  const base = new URL(baseRaw, window.location.origin);
  base.search = '';

  const url = new URL(base.toString());
  const token = (localStorage.getItem('token') || '').trim();
  if (token) url.searchParams.set('token', token);
  if (roomId && !roomId.includes('://') && !roomId.startsWith('ws%3A')) {
    url.searchParams.set('room_id', roomId);
  }

  const final = url.toString();
  console.log('[WS][build] origin page =', window.location.origin);
  console.log('[WS][build] final URL   =', final);
  return final;
}

export default function AppShell(
  {
    rooms,
    currentRoomId,
    onSelectRoom,
    children,
  }: PropsWithChildren & {
    rooms: Room[];
    currentRoomId: string;
    onSelectRoom: (id: string) => void;
  },
) {
  const mounted = useMounted();
  const [rightOpen, setRightOpen] = useState(false);
  const [qsOpen, setQsOpen] = useState(false);
  const [typers, setTypers] = useState<TypersMap>({});
  const [status, setStatus] = useState<WSStatus>('offline');
  const [messagesByRoom, setMessagesByRoom] = useState<MessagesByRoom>({});

  const active = useMemo(
    () => rooms.find((r) => r.id === currentRoomId)!,
    [rooms, currentRoomId],
  );
  const items = messagesByRoom[currentRoomId] || [];

  // Mount log
  useEffect(() => {
    console.log('[AppShell] mounted. rooms=', rooms.length, 'currentRoomId=', currentRoomId);
    return () => console.log('[AppShell] unmounted');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconnect when room changes (stable dependency array!)
  useEffect(() => {
    console.log('[AppShell] effect start for room:', currentRoomId);

    const url = buildWsUrl(currentRoomId);
    console.log('[AppShell] connecting via wsManager.connect(...)');
    wsManager.connect(url);

    setStatus(wsManager.getStatus());
    const unsubStatus = wsManager.onStatus((s) => {
      console.log('[WS][status]', s);
      setStatus(s);
    });

    const unsubEvent = wsManager.onEvent((ev: ServerEvent) => {
      console.log('[WS][event]', ev);

      switch (ev.type) {
        case 'hello':
        case 'conn.ack':
          break;

        case 'message.created': {
          const { id, tempId, roomId, author, content, createdAt } = ev.data;
          setMessagesByRoom((prev) => {
            const list = prev[roomId] || [];
            const idx = tempId ? list.findIndex((m) => m.id === tempId) : -1;
            const nextMsg: Message = { id, roomId, author, content, createdAt };
            const updated =
              idx >= 0
                ? Object.assign([...list], { [idx]: nextMsg })
                : applyInsert(list, nextMsg);
            return { ...prev, [roomId]: updated };
          });
          break;
        }

        case 'message.updated': {
          const { id, roomId, content, editedAt } = ev.data;
          setMessagesByRoom((prev) => {
            const list = prev[roomId] || [];
            const idx = list.findIndex((m) => m.id === id);
            if (idx < 0) return prev;
            const updated = [...list];
            updated[idx] = { ...updated[idx], content, editedAt } as Message;
            return { ...prev, [roomId]: updated };
          });
          break;
        }

        case 'message.deleted': {
          const { id, roomId } = ev.data;
          setMessagesByRoom((prev) => ({
            ...prev,
            [roomId]: (prev[roomId] || []).filter((m) => m.id !== id),
          }));
          break;
        }

        case 'typing.start': {
          const { roomId, userId, name } = ev.data;
          if (roomId !== currentRoomId) return;
          setTypers((prev) =>
            prev[userId] ? prev : { ...prev, [userId]: name || 'Someone' },
          );
          break;
        }

        case 'typing.stop': {
          const { roomId, userId } = ev.data;
          if (roomId !== currentRoomId) return;
          setTypers((prev) => {
            if (!(userId in prev)) return prev;
            const { [userId]: _, ...rest } = prev;
            return rest;
          });
          break;
        }

        default:
          break;
      }
    });

    // Clear typing on room switch
    setTypers({});

    return () => {
      console.log('[AppShell] cleanup: disconnecting WS');
      unsubStatus();
      unsubEvent();
      wsManager.disconnect();
    };
  }, [currentRoomId, rooms.length]);

  // --- send helpers (server expects payload + to for typing) ---
  const sendMessage = (roomId: string, content: string) => {
    const tempId = makeTempId();
    const optimistic: Message = {
      id: tempId,
      roomId,
      author: ME,
      content,
      createdAt: new Date().toISOString(),
    };
    setMessagesByRoom((prev) => ({
      ...prev,
      [roomId]: applyInsert(prev[roomId] || [], optimistic),
    }));

    const ok = wsManager.send({
      type: 'message.send',
      payload: { tempId, roomId, content },
    } as any);
    if (!ok) {
      console.warn('[WS] not open; optimistic message kept');
    }
  };

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
      <ChannelNav
        rooms={rooms}
        activeId={currentRoomId}
        onSelect={onSelectRoom}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-2 border-b bg-background px-2 md:px-3">
          <MobileDrawer
            rooms={rooms}
            activeId={currentRoomId}
            onSelect={onSelectRoom}
          />
          <HeaderBar
            title={`# ${active?.name ?? 'room'}`}
            subtitle={active?.topic}
            onSearch={() => setQsOpen(true)}
            onOpenRightPanel={() => setRightOpen(true)}
          />
        </div>

        <MessageList items={items} meId={ME.id} />

        {/* Gate client-only UI to avoid hydration mismatch */}
        {mounted && <TypingIndicator names={typingNames} />}
        {mounted && (
          <Composer
            roomId={currentRoomId}
            placeholder={`Message # ${active?.name ?? ''}`}
            onTypingStart={() =>
              wsManager.send({
                type: 'typing.start',
                to: currentRoomId,
                payload: { roomId: currentRoomId },
              } as any)
            }
            onTypingStop={() =>
              wsManager.send({
                type: 'typing.stop',
                to: currentRoomId,
                payload: { roomId: currentRoomId },
              } as any)
            }
            onSend={({ text }) => sendMessage(currentRoomId, text)}
          />
        )}
      </div>

      <RightPanel open={rightOpen} onClose={() => setRightOpen(false)} />
      <QuickSwitcher open={qsOpen} onOpenChange={setQsOpen} />
      {children}
    </div>
  );
}
