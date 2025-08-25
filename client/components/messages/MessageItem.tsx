// src/components/messages/MessageItem.tsx
'use client';

import React from 'react';
import { fmtTime } from '@/lib/time';

export default function MessageItem({
    id,
    author,
    content,
    createdAt,
    mine,
    highlighted,
}: {
    id: string;
    author: { username: string; avatarUrl?: string };
    content: string;
    createdAt: string | number;
    mine: boolean;
    highlighted?: boolean;
}) {
    const d = new Date(typeof createdAt === 'number' ? createdAt : String(createdAt));
    const time = Number.isNaN(d.getTime()) ? '' : fmtTime(d.toISOString());

    return (
        <div
            className={
                'group mx-auto max-w-3xl px-3 py-1 ' +
                (highlighted ? 'animate-pulse [animation-iteration-count:2]' : '')
            }
            id={id}
        >
            <div className="flex items-start gap-3">
                <div className="mt-1 h-8 w-8 flex-shrink-0 rounded-full bg-muted overflow-hidden">
                    {author.avatarUrl ? (
                        <img src={author.avatarUrl} alt={author.username} className="h-full w-full object-cover" />
                    ) : null}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-baseline gap-2">
                        <span className="text-sm font-medium">{author.username}</span>
                        {time ? <span className="text-[11px] text-muted-foreground">{time}</span> : null}
                    </div>
                    <div className={`rounded-2xl px-3 py-2 ${mine ? 'bg-primary/10' : 'bg-card border'}`}>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{content}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
