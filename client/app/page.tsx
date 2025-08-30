// app/page.tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function IndexRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/rooms/general'); }, [router]); // or fetch first room then push
  return null;
}
