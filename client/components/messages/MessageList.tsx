'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fmtDay, isSameDay } from '@/lib/time';
import NewMessagesBar from './NewMessagesBar';
import DayDivider from './DayDivider';
import MessageItem from './MessageItem';
import type { Message } from '@/lib/types';
import { ArrowDown } from 'lucide-react';

type ParentPreview = {
    id: string;
    authorName?: string;
    text?: string;
    deleted?: boolean;
};

type Row =
    | { kind: 'day'; id: string; label: string }
    | { kind: 'new'; id: string }
    | {
        kind: 'msg';
        id: string;
        msg: Message;
        mine: boolean;
        showHeader: boolean;
        avatarUrl?: string;
        parentPreview?: ParentPreview; // ✅ make sure this is here
    };

// ---------- helpers ----------
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

function truncate(s: string | undefined | null, n = 80): string {
    if (!s) return '';
    return s.length > n ? s.slice(0, n) + '…' : s;
}


function buildRows(messages: Message[], meId: string, newAnchorId?: string): Row[] {
    const rows: Row[] = [];
    const me = normId(meId);

    // map for O(1) parent lookups within current window
    const byId = new Map<string, Message>();
    for (const m of messages) byId.set(m.id, m);

    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const prev = messages[i - 1];

        if (!prev || !isSameDay(prev.createdAt as any, m.createdAt as any)) {
            rows.push({ kind: 'day', id: `day-${m.id}`, label: fmtDay(m.createdAt as any) });
        }

        if (newAnchorId && m.id === newAnchorId) {
            rows.push({ kind: 'new', id: `new-${m.id}` });
        }

        const mine = normId(m.author?.id) === me;
        const grouped = !!prev && sameAuthor(prev, m) && within(prev.createdAt as any, m.createdAt as any, GROUP_MS);

        // 🔥 build parent preview if this is a reply
        let parentPreview: ParentPreview | undefined; // ✅ no indexed access on Row
        const parentId = (m as any).parentId as string | undefined;
        if (parentId) {
            const parent = byId.get(parentId);
            if (parent) {
                parentPreview = {
                    id: parent.id,
                    authorName: (parent.author as any)?.username,
                    text: parent.deletedAt ? undefined : truncate(parent.content || ''),
                    deleted: !!parent.deletedAt,
                };
            } else {
                // parent not in current slice; keep id so chip can still jump later
                parentPreview = { id: parentId };
            }
        }

        rows.push({
            kind: 'msg',
            id: m.id,
            msg: m,
            mine,
            showHeader: !grouped,
            avatarUrl: avatarFor((m.author as any)?.username || m.author?.id),
            parentPreview,
        });
    }
    return rows;
}

// ---------- component ----------
export default function MessageList({
    items,
    meId,
    highlightId,
    newAnchorId,
    onEditMessage,
    onDeleteMessage,
    editingMessageId,
    onRequestEdit,
    onEndEdit,
    onReply,
}: {
    items: Message[];
    meId: string;
    highlightId?: string;
    newAnchorId?: string;
    onEditMessage?: (msg: Message, newContent: string) => void;
    onDeleteMessage?: (msg: Message) => void;
    editingMessageId?: string | null;
    onRequestEdit?: (id: string) => void;
    onEndEdit?: () => void;
    onReply?: (msg: Message) => void;
}) {
    const [atBottom, setAtBottom] = useState(true);
    const parentRef = useRef<HTMLDivElement | null>(null);

    const rows = useMemo(() => (meId ? buildRows(items, meId, newAnchorId) : []), [items, meId, newAnchorId]);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 68,
        overscan: 10,
    });

    useEffect(() => {
        if (atBottom) {
            const el = parentRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        }
    }, [rows.length, atBottom]);

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
        <div className="relative flex min-h-0 flex-1 flex-col">
            {!atBottom && (
                <button
                    onClick={() => {
                        const el = parentRef.current;
                        if (el) el.scrollTop = el.scrollHeight;
                    }}
                    className="absolute bottom-24 right-3 z-10 rounded-full border bg-card/95 p-2 text-xs shadow transition hover:shadow-md sm:right-4"
                    aria-label="Jump to present"
                >
                    <ArrowDown className="h-4 w-4" />
                </button>
            )}

            <div ref={parentRef} className="flex-1 overflow-auto">
                <div className="px-3 sm:px-4 md:px-6" style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map((vi) => {
                        const row = rows[vi.index];

                        return (
                            <div
                                key={vi.key}
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
                                    <div className="py-1">
                                        <DayDivider label={row.label} />
                                    </div>
                                )}

                                {row?.kind === 'new' && (
                                    <div className="py-1">
                                        <NewMessagesBar />
                                    </div>
                                )}

                                {row?.kind === 'msg' && (
                                    <div className={['py-1', 'flex', row.mine ? 'justify-end' : 'justify-start'].join(' ')}>
                                        <div className="max-w-[92%] sm:max-w-[88%] md:max-w-[80%] lg:max-w-[72%] xl:max-w-[64%]">
                                            <MessageItem
                                                id={row.msg.id}
                                                onReply={() => onReply?.(row.msg)}
                                                author={{
                                                    username: (row.msg.author as any).username,
                                                    avatarUrl: (row as any).avatarUrl,
                                                } as any}
                                                content={row.msg.content}
                                                createdAt={row.msg.createdAt}
                                                mine={row.mine}
                                                highlighted={highlightId === row.msg.id}
                                                editedAt={(row.msg as any).editedAt}
                                                deletedAt={(row.msg as any).deletedAt}
                                                deletedReason={(row.msg as any).deletedReason}
                                                canEdit={row.mine && !row.msg.deletedAt && !row.msg.editedAt}
                                                canDelete={row.mine && !row.msg.deletedAt}
                                                isEditing={editingMessageId === row.msg.id}
                                                editLockActive={!!editingMessageId && editingMessageId !== row.msg.id}
                                                onEdit={(next) => onEditMessage?.(row.msg, next)}
                                                onDelete={() => onDeleteMessage?.(row.msg)}
                                                onRequestEdit={() => onRequestEdit?.(row.msg.id)}
                                                onEndEdit={() => onEndEdit?.()}
                                                showHeader={(row as any).showHeader}
                                                // 🔥 reply chip data
                                                parentId={(row.msg as any).parentId}
                                                parentAuthorName={row.parentPreview?.authorName}
                                                parentText={row.parentPreview?.text}
                                                parentDeleted={row.parentPreview?.deleted}

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
