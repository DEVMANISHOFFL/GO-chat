'use client';
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';


export default function QuickSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Quick Switcher</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                    <Input placeholder="Jump to room or user…" />
                    <div className="text-xs text-muted-foreground">Type to search. Enter to select. Esc to close.</div>
                </div>
            </DialogContent>
        </Dialog>
    );
}