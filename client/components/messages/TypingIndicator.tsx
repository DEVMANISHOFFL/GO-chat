'use client';
import React from 'react';


export default function TypingIndicator({ names }: { names: string[] }) {
    if (!names.length) return null;
    const label = names.length === 1 ? `${names[0]} is typing…` : `${names.slice(0, 2).join(', ')} ${names.length > 2 ? 'and others ' : ''}are typing…`;
    return (
        <div className="mx-auto mb-2 mt-1 w-fit rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {label}
        </div>
    );
}