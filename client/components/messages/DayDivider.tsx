'use client';
import React from 'react';


export default function DayDivider({ label }: { label: string }) {
    return (
        <div className="my-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground select-none">{label}</span>
            <div className="h-px flex-1 bg-border" />
        </div>
    );
}