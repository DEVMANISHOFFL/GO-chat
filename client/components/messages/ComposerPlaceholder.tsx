'use client';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';


export default function ComposerPlaceholder({ roomLabel }: { roomLabel?: string }) {
    return (
        <div className="border-t bg-background p-3">
            <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-xl border bg-card p-2">
                <Input placeholder={`Message ${roomLabel ?? ''}`.trim()} className="border-0 focus-visible:ring-0" />
                <Button size="sm">Send</Button>
            </div>
        </div>
    );
}