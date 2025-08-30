'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Lazy-load UsersPanel so it only fetches when panel opens
const UsersPanel = dynamic(() => import('@/components/users/UsersPanel'), {
  ssr: false,
  loading: () => (
    <div className="p-4">
      <div className="mb-3 h-5 w-28 animate-pulse rounded bg-muted" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mb-2 h-14 w-full animate-pulse rounded-xl bg-muted" />
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
  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop: click anywhere outside closes */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black"
            onClick={onClose}
            aria-hidden
          />

          {/* Slide-over */}
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="fixed right-0 top-0 z-50 h-dvh w-80 border-l bg-card"
            role="dialog"
            aria-label="Right panel"
          >
            <div className="flex h-14 items-center justify-between border-b px-3">
              <div className="font-semibold">People</div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
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
