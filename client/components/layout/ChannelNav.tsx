'use client';
import React from 'react';
import { Hash, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { Room } from '../../lib/types';
import Link from 'next/link';
import { Home } from 'lucide-react';


export default function ChannelNav({ rooms, activeId, onSelect }: { rooms: Room[]; activeId?: string; onSelect: (id: string) => void }) {
    return (
        <div className="hidden h-full w-64 flex-col border-r bg-card md:flex">
            <div className="flex items-center gap-2 p-3">
                <Hash className="h-4 w-4" />
                <span className="font-semibold">Channels</span>
                <div className="ml-auto" />
                <Button size="icon" variant="ghost" aria-label="Add channel">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
                <div className="p-2">
                    {rooms.map((r) => {
                        const active = r.id === activeId;
                        return (
                            <button
                                key={r.id}
                                onClick={() => onSelect(r.id)}
                                className={
                                    'group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ' +
                                    (active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted')
                                }
                            >
                                <Hash className="h-4 w-4" />
                                <span className="truncate">{r.name}</span>
                                <div className="ml-auto flex items-center gap-2">
                                    {r.unreadCount ? (
                                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{r.unreadCount}</span>
                                    ) : null}
                                    <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}