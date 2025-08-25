'use client';

import { useEffect, useState } from 'react';
import { getToken, getExpiresAt } from '@/app/lib/session';
import { attemptRefresh, logoutToLogin } from '@/app/lib/refresh';

export function useAccessToken() {
  const [token, setToken] = useState<string | null>(null);

  // read token initially
  useEffect(() => {
    const t = getToken();
    if (!t) return;
    setToken(t);
  }, []);

  // schedule proactive refresh
  useEffect(() => {
    let timer: number | undefined;

    async function schedule() {
      const exp = getExpiresAt(); // unix seconds
      const nowMs = Date.now();
      const expMs = exp ? exp * 1000 : null;

      // if we don't know, try a refresh soon-ish
      let delay = 30_000;

      if (expMs) {
        // refresh 60s before expiry
        delay = Math.max(0, expMs - nowMs - 60_000);
      }

      timer = window.setTimeout(async () => {
        const res = await attemptRefresh();
        if (res?.token) {
          setToken(res.token); // trigger re-connects that depend on token
          // re-schedule next refresh
          schedule();
        } else {
          // couldn't refresh (likely token already expired) -> logout
          logoutToLogin();
        }
      }, delay);
    }

    schedule();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return token;
}
