'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Hash, Home } from 'lucide-react';

export default function ChannelNav({
  rooms,
  activeId,
  onSelect, // kept for API but we’ll rely on links
}: {
  rooms: Array<{ id: string; name: string }>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Link href="/" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
          <Home className="h-5 w-5" />
          <span className="text-sm font-medium">Home</span>
        </Link>
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Channels
        </div>
        <div className="text-xs text-muted-foreground">{rooms?.length ?? 0}</div>
      </div>

      <nav className="flex-1 overflow-auto px-2 pb-2">
        {rooms.map((r) => {
          const href = `/rooms/${r.id}`;
          const active = r.id === activeId || pathname === href;
          return (
            <Link
              key={r.id}
              href={href}
              className={[
                'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                active ? 'bg-accent font-medium' : '',
              ].join(' ')}
              title={r.name}
            >
              <Hash className="h-4 w-4 opacity-70 group-hover:opacity-100" />
              <span className="truncate"># {r.name}</span>
            </Link>
          );
        })}
        {!rooms.length && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No rooms yet.</div>
        )}
      </nav>
    </aside>
  );
}
