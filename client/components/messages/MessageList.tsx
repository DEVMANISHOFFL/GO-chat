'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fmtDay, isSameDay } from '@/lib/time';
import NewMessagesBar from './NewMessagesBar';
import DayDivider from './DayDivider';
import MessageItem from './MessageItem';
import type { Message } from '@/lib/types';

type Row =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'new'; id: string }
  | {
      kind: 'msg';
      id: string;
      msg: Message;
      mine: boolean;
      showHeader: boolean;     // first in a grouped run
      avatarUrl?: string;      // optional if you want avatars
    };

// ---------- helpers (pure) ----------
const GROUP_MS = 5 * 60 * 1000;
const normId = (v?: string | null) => (v ?? '').trim().toLowerCase();

function sameAuthor(a?: Message, b?: Message) {
  return a?.author?.id && b?.author?.id && normId(a.author.id) === normId(b.author.id);
}
function within(a: string | number, b: string | number, ms: number) {
  const ta = new Date(typeof a === 'number' ? a : String(a)).getTime();
  const tb = new Date(typeof b === 'number' ? b : String(b)).getTime();
  return Math.abs(ta - tb) < ms;
}
function avatarFor(seedLike: string) {
  const seed = encodeURIComponent(seedLike || 'user');
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundType=gradientLinear`;
}

function buildRows(messages: Message[], meId: string, newAnchorId?: string): Row[] {
  const rows: Row[] = [];
  const me = normId(meId);

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];

    // Day divider at first message of the day
    if (!prev || !isSameDay(prev.createdAt as any, m.createdAt as any)) {
      rows.push({ kind: 'day', id: `day-${m.id}`, label: fmtDay(m.createdAt as any) });
    }

    // Optional "new" divider with unique id (so React keys don't collide)
    if (newAnchorId && m.id === newAnchorId) {
      rows.push({ kind: 'new', id: `new-${m.id}` });
    }

    const mine = normId(m.author?.id) === me;
    const grouped =
      !!prev && sameAuthor(prev, m) && within(prev.createdAt as any, m.createdAt as any, GROUP_MS);
    const showHeader = !grouped;

    rows.push({
      kind: 'msg',
      id: m.id,
      msg: m,
      mine,
      showHeader,
      avatarUrl: !mine ? avatarFor(m.author?.username || m.author?.id) : undefined,
    });
  }
  return rows;
}

// ---------- component ----------
export default function MessageList({
  items,
  meId,                 // REQUIRED: pass the real user id
  highlightId,
  newAnchorId,
}: {
  items: Message[];
  meId: string;
  highlightId?: string;
  newAnchorId?: string;
}) {
  // stable hooks order (no conditional returns)
  const [atBottom, setAtBottom] = useState(true);
  const parentRef = useRef<HTMLDivElement | null>(null);

  // Gate via data, not control flow: if meId is missing, we still run hooks but rows = []
  const meReady = !!meId;
  const rows = useMemo(
    () => (meReady ? buildRows(items, meId, newAnchorId) : []),
    [items, meId, newAnchorId, meReady]
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  // Auto-stick to bottom on new rows when already at bottom
  useEffect(() => {
    if (atBottom) {
      const el = parentRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [rows.length, atBottom]);

  // Track bottom proximity
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      setAtBottom(nearBottom);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!atBottom && (
        <button
          onClick={() => {
            const el = parentRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="absolute bottom-24 right-4 z-10 rounded-full border bg-card/95 px-3 py-1 text-xs shadow transition hover:shadow-md"
        >
          Jump to present
        </button>
      )}

      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];

            return (
              <div
                key={vi.key} // use virtualizer's stable key to avoid warnings
                data-index={vi.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                {row?.kind === 'day' && (
                  <div className="px-3">
                    <DayDivider label={row.label} />
                  </div>
                )}

                {row?.kind === 'new' && (
                  <div className="px-3">
                    <NewMessagesBar />
                  </div>
                )}

                {row?.kind === 'msg' && (
                  <div
                    className={[
                      'px-3 py-1',
                      'flex',
                      row.mine ? 'justify-end' : 'justify-start', // right for sender, left for others
                    ].join(' ')}
                  >
                    <div className="max-w-[75%] sm:max-w-[68%] md:max-w-[60%]">
                      <MessageItem
                        id={row.msg.id}
                        author={
                          // If your MessageItem supports showHeader/avatarUrl,
                          // you can pass them via "as any" to avoid type errors.
                          // Otherwise it will just ignore these props.
                          {
                            username: row.msg.author.username,
                            avatarUrl: (row as any).avatarUrl,
                          } as any
                        }
                        content={row.msg.content}
                        createdAt={row.msg.createdAt}
                        mine={row.mine}
                        highlighted={highlightId === row.msg.id}
                        // @ts-expect-error optional prop in some versions
                        showHeader={(row as any).showHeader}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
