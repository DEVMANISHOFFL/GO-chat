'use client';
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';

const UsersPanel = dynamic(() => import('@/components/users/UsersPanel'), {
  ssr: false,
  loading: () => (
    <div className="p-4">
      <div className="h-5 w-28 rounded bg-muted mb-3 animate-pulse" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 w-full rounded-xl bg-muted animate-pulse mb-2" />
      ))}
    </div>
  ),
});

export default function RightPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 🔥 Backdrop that closes panel when clicked */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black"
            onClick={onClose}
            aria-hidden
          />

          {/* Slide-over panel */}
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="fixed right-0 top-0 z-50 h-dvh w-80 border-l bg-card"
          >
            <div className="flex h-14 items-center justify-between border-b px-3">
              <div className="font-semibold">People</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close panel"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="h-[calc(100dvh-3.5rem)] overflow-auto">
              <UsersPanel />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
