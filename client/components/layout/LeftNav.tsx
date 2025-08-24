'use client';
import React from 'react';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function LeftNav({ onOpenSettings, onOpenQuickSwitcher }: { onOpenSettings: () => void; onOpenQuickSwitcher: () => void }) {
    return (
        <div className="flex h-full w-16 flex-col items-center gap-2 border-r bg-sidebar p-2 text-sidebar-foreground">
            <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold" onClick={onOpenQuickSwitcher} aria-label="Open quick switcher">
                C
            </button>
            <Separator className="my-2" />
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="rounded-xl" aria-label="Create/Join">
                            <Plus className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create or Join</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <div className="mt-auto" />
            <Button size="icon" variant="ghost" onClick={onOpenSettings} aria-label="Settings">
                <Users className="h-5 w-5" />
            </Button>
        </div>
    );
}