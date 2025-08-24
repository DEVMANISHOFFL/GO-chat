'use client';
import React from 'react';
import { Menu, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import type { Room } from '@/lib/types';


export default function MobileDrawer({ rooms, activeId, onSelect }: { rooms: Room[]; activeId?: string; onSelect: (id: string) => void }) {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open channels">
                    <Menu className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
                <SheetHeader className="p-4">
                    <SheetTitle>Channels</SheetTitle>
                </SheetHeader>
                <Separator />
                <div className="p-2">
                    {rooms.map((r) => {
                        const active = r.id === activeId;
                        return (
                            <button
                                key={r.id}
                                onClick={() => onSelect(r.id)}
                                className={'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ' + (active ? 'bg-primary/10' : 'hover:bg-muted')}
                            >
                                <Hash className="h-4 w-4" />
                                <span className="truncate">{r.name}</span>
                                {r.unreadCount ? (
                                    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{r.unreadCount}</span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}