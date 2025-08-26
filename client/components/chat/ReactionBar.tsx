// src/components/messages/ReactionBar.tsx
'use client';

import React, { useRef } from 'react';
import { addReaction, removeReaction } from '@/lib/reactions';
import { normalizeEmoji } from '@/lib/emoji';

const EMOJIS = ['👍','❤️','😂','🎉','😮','😢'];

export default function ReactionBar({
  messageId,
  myEmoji,
  onChange,
  className = '',
}: {
  messageId: string;
  myEmoji?: string | null;
  onChange?: (nextEmoji: string | null, prevEmoji: string | null) => void;
  className?: string;
}) {
  const busy = useRef(false);
  const currentNorm = myEmoji ? normalizeEmoji(myEmoji) : null;

  const toggle = async (raw: string) => {
    if (busy.current) return;
    busy.current = true;

    const clickedNorm = normalizeEmoji(raw);
    const prevNorm = currentNorm;

    try {
      if (prevNorm === clickedNorm) {
        onChange?.(null, prevNorm);
        await removeReaction(messageId, clickedNorm);
      } else {
        onChange?.(clickedNorm, prevNorm);
        if (prevNorm) await removeReaction(messageId, prevNorm);
        await addReaction(messageId, clickedNorm);
      }
    } catch (err: any) {
      console.error('Reaction error:', err?.message || err);
      // revert optimistic change
      onChange?.(prevNorm ?? null, currentNorm ?? null);
      if (err?.message?.includes('Missing Authorization')) alert('Please sign in to react.');
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className={`flex gap-1 ${className}`}>
      {EMOJIS.map((raw) => {
        const eNorm = normalizeEmoji(raw);
        const active = currentNorm === eNorm;
        return (
          <button
            key={eNorm}
            onClick={() => toggle(raw)}
            className={`rounded px-1.5 py-0.5 text-sm transition
              ${active ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent'}
            `}
            aria-pressed={active}
            aria-label={`React ${raw}`}
          >
            {raw}
          </button>
        );
      })}
    </div>
  );
}
