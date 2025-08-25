'use client';

import { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const doLogout = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token') || '';
      const refresh = localStorage.getItem('refresh_token') || '';
      if (token && refresh) {
        await fetch(`${API}/api/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ refresh_token: refresh }),
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('expires_at');
      window.location.href = '/login';
    }
  };

  return (
    <button
      onClick={doLogout}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      title="Logout"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      Logout
    </button>
  );
}
