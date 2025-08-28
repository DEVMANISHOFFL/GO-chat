'use client';

import React from 'react';

export default function TypingIndicator({ names }: { names: string[] }) {
  // show only if someone is typing
  if (!names || names.length === 0) return null;

  return (
    <div
      className="
        pointer-events-none
        absolute bottom-4 left-4 z-20
      "
      aria-label="Someone is typing"
    >
      <div
        className="
          pointer-events-auto
          flex items-center gap-1.5
          rounded-full px-2.5 py-1.5
          bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500
          text-white shadow-lg shadow-fuchsia-500/15 ring-1 ring-white/15
        "
      >
        <Dot delay="0ms" />
        <Dot delay="120ms" />
        <Dot delay="240ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="
        inline-block h-1.5 w-1.5 rounded-full bg-white/90
        animate-ig-bounce
      "
      style={{ animationDelay: delay }}
      aria-hidden="true"
    />
  );
}
