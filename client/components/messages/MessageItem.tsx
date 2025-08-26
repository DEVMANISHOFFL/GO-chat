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

  // NEW:
  editedAt,
  deletedAt,
  deletedReason,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  showHeader,
}: {
  id: string;
  author: { username: string; avatarUrl?: string };
  content: string;
  createdAt: string | number;
  mine: boolean;
  highlighted?: boolean;

  // NEW:
  editedAt?: string | number;
  deletedAt?: string | number;
  deletedReason?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;

  // existing but optional in caller
  showHeader?: boolean;
}) {
  const created = new Date(typeof createdAt === 'number' ? createdAt : String(createdAt));
  const time = Number.isNaN(created.getTime()) ? '' : fmtTime(created.toISOString());

  const isDeleted = !!deletedAt;
  const isEdited = !!editedAt && !isDeleted;

  return (
    <div
      className={
        'group mx-auto max-w-3xl px-3 py-1 ' +
        (highlighted ? 'animate-pulse [animation-iteration-count:2]' : '')
      }
      id={id}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="mt-1 h-8 w-8 flex-shrink-0 rounded-full bg-muted overflow-hidden">
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt={author.username} className="h-full w-full object-cover" />
          ) : null}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          {/* Header (username + time + edited) */}
          {showHeader !== false && (
            <div className="mb-0.5 flex items-baseline gap-2">
              <span className="text-sm font-medium">{author.username}</span>
              {time ? <span className="text-[11px] text-muted-foreground">{time}</span> : null}
              {isEdited ? <span className="text-[11px] text-muted-foreground">· edited</span> : null}
            </div>
          )}

          {/* Bubble */}
          <div className={`rounded-2xl px-3 py-2 ${mine ? 'bg-primary/10' : 'bg-card border'}`}>
            {!isDeleted ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{content}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                {deletedReason?.trim()
                  ? `Message deleted (${deletedReason})`
                  : 'Message deleted'}
              </p>
            )}
          </div>

          {/* Hover actions (hide on deleted) */}
          {!isDeleted && (canEdit || canDelete) ? (
            <div className="mt-1 hidden gap-3 text-xs text-muted-foreground group-hover:flex">
              {canEdit ? (
                <button className="hover:underline" onClick={onEdit} aria-label="Edit message">
                  Edit
                </button>
              ) : null}
              {canDelete ? (
                <button className="hover:underline" onClick={onDelete} aria-label="Delete message">
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
