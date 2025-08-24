'use client';
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';


export default function RightPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.aside
                    initial={{ x: 320, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 320, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                    className="hidden w-80 border-l bg-card md:block"
                >
                    <div className="flex h-14 items-center justify-between border-b px-3">
                        <div className="font-semibold">Right Panel</div>
                        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>
                    <div className="p-3 text-sm text-muted-foreground">Members / Thread / Pins / Info</div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
}