'use client';
import React from 'react';
import type { WSStatus } from '@/lib/ws-types';


export default function ConnectionBanner({ status, retryInMs }: { status: WSStatus; retryInMs?: number }) {
    if (status === 'connected') return null;
    const label = status === 'connecting' ? 'Reconnecting…' : 'Offline';
    return (
        <div className="z-10 flex items-center justify-center gap-2 border-b bg-yellow-500/10 px-3 py-1 text-xs text-yellow-600 dark:text-yellow-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
            {label}
            {retryInMs ? <span className="text-[11px] text-muted-foreground">(retry in {Math.ceil(retryInMs / 1000)}s)</span> : null}
        </div>
    );
}