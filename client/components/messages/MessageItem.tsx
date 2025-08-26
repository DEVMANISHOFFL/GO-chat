'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { fmtTime } from '@/lib/time';

type Author = { username: string; avatarUrl?: string };

export default function MessageItem({
    id,
    author,
    content,
    createdAt,
    mine,
    highlighted,
    editedAt,
    deletedAt,
    deletedReason,
    canEdit,          // already includes "one edit only" logic from parent
    canDelete,
    isEditing,        // global lock: this row currently editing?
    editLockActive,   // some other row is editing now
    onEdit,           // (next: string) => void
    onDelete,
    onRequestEdit,    // request to start editing this row
    onEndEdit,        // signal that editing ended (save or cancel)
    showHeader,
}: {
    id: string;
    author: Author;
    content: string;
    createdAt: string | number;
    mine: boolean;
    highlighted?: boolean;
    editedAt?: string | number;
    deletedAt?: string | number;
    deletedReason?: string;
    canEdit?: boolean;
    canDelete?: boolean;
    isEditing?: boolean;
    editLockActive?: boolean;
    onEdit?: (next: string) => void;
    onDelete?: () => void;
    onRequestEdit?: () => void;
    onEndEdit?: () => void;
    showHeader?: boolean;
}) {
    const created = new Date(typeof createdAt === 'number' ? createdAt : String(createdAt));
    const time = Number.isNaN(created.getTime()) ? '' : fmtTime(created.toISOString());
    const isDeleted = !!deletedAt;
    const isEdited = !!editedAt && !isDeleted;
    const doDelete = () => {
        setMenuOpen(false);
        setTimeout(() => onDelete?.(), 0);
    };

    // context / long-press menu
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const containerRef = React.useRef<HTMLDivElement | null>(null);

    // inline editor
    const [editValue, setEditValue] = React.useState(content);
    React.useEffect(() => setEditValue(content), [content]);

    // start edit handler
    const beginEdit = () => {
        if (!canEdit) return;                // already edited or not allowed
        if (editLockActive) return;          // someone else is editing
        onRequestEdit?.();                   // claim the global lock
        setMenuOpen(false);
    };

    const saveEdit = () => {
        const next = editValue.trim();
        if (!next || next === content) { cancelEdit(); return; }
        onEdit?.(next);
        onEndEdit?.();
    };
    const cancelEdit = () => {
        setEditValue(content);
        onEndEdit?.();
    };

    // mobile long-press
    const lp = React.useRef<number | null>(null);
    const startLP = (e: React.TouchEvent) => {
        if (isDeleted || (!canEdit && !canDelete)) return;
        const t = e.touches[0];
        if (!t) return;
        stopLP();
        lp.current = window.setTimeout(() => {
            setMenuPos({ x: t.clientX, y: t.clientY });
            setMenuOpen(true);
            navigator.vibrate?.(15);
        }, 450);
    };
    const stopLP = () => { if (lp.current) { clearTimeout(lp.current); lp.current = null; } };

    // right-click
    const onCtx = (e: React.MouseEvent) => {
        if (isDeleted || (!canEdit && !canDelete)) return;
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY });
        setMenuOpen(true);
    };

    // outside/esc close for menu
    React.useEffect(() => {
        if (!menuOpen) return;
        const onDoc = (e: MouseEvent) => {
            if (!containerRef.current) return setMenuOpen(false);
            if (!containerRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, [menuOpen]);

    return (
        <div
            ref={containerRef}
            id={id}
            className={'group mx-auto max-w-3xl px-3 py-1 select-text ' + (highlighted ? 'animate-pulse [animation-iteration-count:2]' : '')}
            onContextMenu={onCtx}
            onTouchStart={startLP}
            onTouchEnd={stopLP}
            onTouchMove={stopLP}
            onTouchCancel={stopLP}
        >
            <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="mt-1 h-8 w-8 flex-shrink-0 rounded-full bg-muted overflow-hidden">
                    {author.avatarUrl ? <img src={author.avatarUrl} alt={author.username} className="h-full w-full object-cover" /> : null}
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                    {showHeader !== false && (
                        <div className="mb-0.5 flex items-baseline gap-2">
                            <span className="text-sm font-medium">{author.username}</span>
                            {time ? <span className="text-[11px] text-muted-foreground">{time}</span> : null}
                            {isEdited ? <span className="text-[11px] text-muted-foreground">· edited</span> : null}
                        </div>
                    )}

                    {/* Bubble */}
                    <div className={`rounded-2xl px-3 py-2 ${mine ? 'bg-primary/10' : 'bg-card border'}`}>
                        {isDeleted ? (
                            <p className="text-sm italic text-muted-foreground">
                                {deletedReason?.trim() ? `Message deleted (${deletedReason})` : 'Message deleted'}
                            </p>
                        ) : isEditing ? (
                            <div className="flex items-end gap-2">
                                {/* Instagram-like input: rounded, subtle border, expands with content */}
                                <div className="flex-1 rounded-2xl border bg-background px-3 py-2">
                                    <textarea
                                        className="block w-full resize-none bg-transparent text-sm leading-6 outline-none"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        rows={1}
                                        onInput={(e) => {
                                            const ta = e.currentTarget;
                                            ta.style.height = 'auto';
                                            ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                const trimmed = editValue.trim();
                                                if (!trimmed) { cancelEdit(); return; }
                                                saveEdit();
                                            }
                                        }}
                                        autoFocus
                                    />

                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        className="rounded-full bg-primary p-2 text-primary-foreground shadow hover:opacity-90"
                                        title="Save"
                                        onClick={saveEdit}
                                    >
                                        ✓
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-full border p-2 hover:bg-accent"
                                        title="Cancel"
                                        onClick={cancelEdit}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">{content}</p>
                        )}
                    </div>

                    {/* If user tries to edit again after first edit, hint why it's disabled */}
                    {/* {!isDeleted && editedAt && mine && (
            <div className="mt-1 text-[11px] text-muted-foreground">You’ve already edited this once.</div>
          )} */}
                </div>
            </div>

            {/* Context / long-press menu */}
            {menuOpen &&
                createPortal(
                    <>
                        {/* BLUR BACKDROP */}
                        <div className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm" onClick={() => setMenuOpen(false)} aria-hidden />
                        <div
                            className="fixed z-[61] min-w-[180px] rounded-xl border bg-popover text-popover-foreground shadow-lg"
                            style={{ left: menuPos.x, top: menuPos.y }}
                            role="menu"
                            aria-label="Message actions"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                        >
                            <ul className="py-2">
                                <MenuItem label="Edit" disabled={!canEdit || !!editedAt || isDeleted || !!editLockActive} kbd="E" onClick={beginEdit} />
                                <MenuItem label="Delete" disabled={!canDelete || isDeleted} kbd="Del" danger onClick={doDelete} />
                            </ul>
                        </div>
                    </>,
                    document.body
                )}
        </div>
    );
}

function MenuItem({
    label,
    onClick,
    disabled,
    danger,
    kbd,
}: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    danger?: boolean;
    kbd?: string;
}) {
    const base = 'flex w-full items-center justify-between px-3 py-2 text-sm';
    const active = 'hover:bg-accent hover:text-accent-foreground';
    const off = 'opacity-50';
    return (
        <li role="none">
            <button
                type="button"
                className={`${base} ${disabled ? off : active} ${danger ? 'text-red-600 dark:text-red-400' : ''} w-full text-left`}
                disabled={disabled}
                aria-disabled={disabled || undefined}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (!disabled) onClick?.(); }}
                onTouchStart={(e) => e.stopPropagation()}
            >
                <span>{label}</span>
                {kbd ? <span className="text-[10px] opacity-60">{kbd}</span> : null}
            </button>
        </li>
    );
}
