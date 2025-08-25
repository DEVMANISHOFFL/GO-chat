'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { postJSON } from '@/app/lib/api';
import { saveTokens } from '@/app/lib/session';

type LoginResp = { token: string; refresh_token: string; expires_at: number };

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email_or_username = String(fd.get('email_or_username') || '').trim();
    const password = String(fd.get('password') || '');

    try {
      const { token, refresh_token, expires_at } = await postJSON<LoginResp>('/login', {
        email_or_username,
        password,
      });
      // ✅ store token, refresh, and expiry
      saveTokens(token, refresh_token, expires_at);
      window.location.href = '/'; // redirect to chat home
    } catch (e: any) {
      setErr(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow"
      >
        <div className="text-xl font-semibold">Welcome back</div>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {err}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm">Email or Username</label>
          <input
            name="email_or_username"
            required
            className="w-full rounded-md border bg-background px-3 py-2"
            placeholder="you@example.com or yourname"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Password</label>
          <input
            name="password"
            type="password"
            required
            className="w-full rounded-md border bg-background px-3 py-2"
            placeholder="••••••••"
          />
        </div>

        <button
          disabled={loading}
          className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>

        <div className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/signup" className="text-primary underline">
            Create an account
          </Link>
        </div>
      </form>
    </main>
  );
}
