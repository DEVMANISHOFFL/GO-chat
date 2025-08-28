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
        parentPreview?: ParentPreview;
    }
    | {
        kind: 'typing';
        id: string;
        names: string[];
        avatars: string[]; // generated from names
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

function truncate(s: string, max = 100): string {
    const str = (s ?? "").trim();
    if (str.length <= max) return str;
    // cut at a word boundary if possible
    const cut = str.slice(0, max + 1);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 40 ? cut.slice(0, lastSpace) : str.slice(0, max)) + "…";
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
    typingNames,

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
    typingNames?: string[];

}) {
    const [atBottom, setAtBottom] = useState(true);
    const last = items[items.length - 1];


    const parentRef = useRef<HTMLDivElement | null>(null);

    const rows = useMemo(() => {
        const base = meId ? buildRows(items, meId, newAnchorId) : [];
        const activeTypers = (typingNames ?? []).filter(Boolean);

        if (activeTypers.length > 0) {
            const avatars = activeTypers.slice(0, 3).map(n => avatarFor(n)); // reuse your avatarFor()
            base.push({
                kind: 'typing',
                id: 'typing-row',
                names: activeTypers,
                avatars,
            });
        }
        return base;
    }, [items, meId, newAnchorId, typingNames]);


    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 68,
        overscan: 10,
    });



    const scrollToBottom = () => {
        if (rows.length === 0) return;
        rowVirtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    };

    const [localHi, setLocalHi] = useState<string | null>(null);


    const idToIndex = useMemo(() => {
        const m = new Map<string, number>();
        rows.forEach((r, i) => {
            if (r.kind === 'msg') m.set(r.id, i);
        });
        return m;
    }, [rows]);

    const jumpToMessage = (id: string) => {
        const idx = idToIndex.get(id);
        if (idx == null) return; // parent not in window
        rowVirtualizer.scrollToIndex(idx, { align: 'center' });
        setLocalHi(id);
        window.setTimeout(() => setLocalHi(null), 1500);
    };
    const effHi = highlightId ?? localHi;



    useEffect(() => {
        if (atBottom) {
            const el = parentRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        }
    }, [rows.length, atBottom]);

    useEffect(() => {
        if (items.length === 0) return;
        const last = items[items.length - 1];
        if (last.author?.id === meId) {
            // I sent this message → scroll to bottom
            scrollToBottom();
        }
    }, [items.length, meId]);


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
        <div className="relative flex min-h-0 flex-1  flex-col">
            {!atBottom && (
                <button
                    onClick={() => {
                        const el = parentRef.current;
                        if (el) el.scrollTop = el.scrollHeight;
                        scrollToBottom
                    }}
                    className="
  absolute bottom-6 left-1/2 -translate-x-1/2 
  z-10 rounded-full border bg-card/95 p-3 shadow 
  transition hover:shadow-md
"
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
                                {row?.kind === 'typing' && (
                                    <div className="py-1  pl-8 flex justify-start">
                                        {/* Overlapped avatars (like normal message avatar area) */}
                                        <div className="mr-2 mt-0.5 flex -space-x-2">
                                            {row.avatars.map((src, i) => (
                                                <img
                                                    key={i}
                                                    src={src}
                                                    alt=""
                                                    className="h-8 w-8 rounded-full ring-2 ring-background shadow"
                                                    style={{ zIndex: 10 - i }}
                                                />
                                            ))}
                                            {row.names.length > 3 && (
                                                <div className="h-8 w-8 rounded-full bg-muted ring-2 ring-background shadow flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                                                    +{row.names.length - 3}
                                                </div>
                                            )}
                                        </div>

                                        {/* Bubble with same max-width as your other messages */}
                                        <div className="max-w-[92%] sm:max-w-[88%] md:max-w-[80%] lg:max-w-[72%] xl:max-w-[64%]">
                                            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-border/40 bg-muted px-3 py-2 shadow-sm w-fit">
                                                <Dot delay="0ms" />
                                                <Dot delay="120ms" />
                                                <Dot delay="240ms" />
                                            </div>
                                        </div>
                                    </div>
                                )}

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
                                    <div className={[
                                        'py-1', 'flex', 'rounded-2xl p-2 transition',
                                        row.mine ? 'justify-end' : 'justify-start',
                                        effHi === row.id
                                            ? 'jump-highlight ring-2 ring-primary/60 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]'
                                            : ''
                                    ].join(' ')}
                                        style={{ scrollMarginTop: '40px' }}>
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
                                                onJumpToMessage={jumpToMessage}

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

function Dot({ delay }: { delay: string }) {
    return (
        <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-foreground/70 animate-ig-bounce"
            style={{ animationDelay: delay }}
            aria-hidden="true"
        />
    );
}
