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
    | { kind: 'new'; id: 'new-divider' }
    | { kind: 'msg'; id: string; msg: Message; mine: boolean };


function buildRows(messages: Message[], meId = 'me', newAnchorId?: string): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const prev = messages[i - 1];
        if (!prev || !isSameDay(prev.createdAt, m.createdAt)) {
            rows.push({ kind: 'day', id: `day-${m.id}`, label: fmtDay(m.createdAt) });
        }
        if (newAnchorId && m.id === newAnchorId) rows.push({ kind: 'new', id: 'new-divider' });
        rows.push({ kind: 'msg', id: m.id, msg: m, mine: m.author.id === meId });
    }
    return rows;
}

export default function MessageList({ items, meId = 'me', highlightId }: { items: Message[]; meId?: string; highlightId?: string }) {
    const [atBottom, setAtBottom] = useState(true);
    const parentRef = useRef<HTMLDivElement | null>(null);


    const rows = useMemo(() => buildRows(items, meId, undefined), [items, meId]);


    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64,
        overscan: 10,
    });


    useEffect(() => {
        if (atBottom) {
            const el = parentRef.current; if (el) el.scrollTop = el.scrollHeight;
        }
    }, [rows.length, atBottom]);

    useEffect(() => {
        const el = parentRef.current; if (!el) return;
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
                <button onClick={() => { const el = parentRef.current; if (el) el.scrollTop = el.scrollHeight; }} className="absolute bottom-24 right-4 z-10 rounded-full border bg-card/95 px-3 py-1 text-xs shadow">
                    Jump to present
                </button>
            )}
            <div ref={parentRef} className="flex-1 overflow-auto">
                <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map((vi) => {
                        const row = rows[vi.index];
                        return (
                            <div key={row.id} data-index={vi.index} ref={rowVirtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}>
                                {row.kind === 'day' && <DayDivider label={row.label} />}
                                {row.kind === 'new' && <NewMessagesBar />}
                                {row.kind === 'msg' && (
                                    <MessageItem id={row.msg.id} author={row.msg.author} content={row.msg.content} createdAt={row.msg.createdAt} mine={row.mine} highlighted={highlightId === row.msg.id} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}