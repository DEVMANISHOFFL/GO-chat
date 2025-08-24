'use client';
import React from 'react';


export default function MessageListPlaceholder() {
    return (
        <div className="flex-1 select-none p-6">
            <div className="mx-auto max-w-3xl space-y-3">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full bg-muted" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-24 rounded bg-muted" />
                            <div className="h-4 w-3/4 rounded bg-muted" />
                            <div className="h-4 w-1/2 rounded bg-muted" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}