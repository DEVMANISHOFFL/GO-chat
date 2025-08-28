// app/people/page.tsx
'use client';

import UsersPanel from '@/components/users/UsersPanel';

export default function PeoplePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="border-b px-4 py-3">
        <h1 className="text-xl font-semibold">People</h1>
        <p className="text-sm text-muted-foreground">Start a private chat with anyone.</p>
      </div>
      <UsersPanel />
    </div>
  );
}
