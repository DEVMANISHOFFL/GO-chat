'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { postJSON } from '@/app/lib/api';

type SignupResponse = {
  id: string;
  username: string;
  email: string;
};

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') || '').trim();
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');

    try {
      const res = await postJSON<SignupResponse>('/signup', { username, email, password });
      setOk(`Account created for @${res.username}. Redirecting to login…`);
      // small delay so user sees success
      setTimeout(() => (window.location.href = '/login'), 600);
    } catch (e: any) {
      setErr(e?.message || 'Sign up failed');
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
        <div className="text-xl font-semibold">Create your account</div>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {err}
          </div>
        )}
        {ok && (
          <div className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm">
            {ok}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm">Username</label>
          <input
            name="username"
            required
            minLength={3}
            className="w-full rounded-md border bg-background px-3 py-2"
            placeholder="yourname"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Email</label>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-md border bg-background px-3 py-2"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className="w-full rounded-md border bg-background px-3 py-2"
            placeholder="••••••••"
          />
        </div>

        <button
          disabled={loading}
          className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Sign up'}
        </button>

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary underline">
            Log in
          </Link>
        </div>
      </form>
    </main>
  );
}
