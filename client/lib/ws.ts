// src/lib/ws.ts
import { WSStatus, ServerEvent, ClientEvent } from './ws-types';

export type Listener = (ev: ServerEvent) => void;

class WSManager {
  private ws: WebSocket | null = null;
  private url: string | null = null;

  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: WSStatus) => void>();
  private status: WSStatus = 'offline';

  private shouldRun = false;
  private backoff = 500; // ms (capped)
  private pingTimer: any = null;

  // queue events when offline, auto-flush on connect
  private outbox: ClientEvent[] = [];

  // ---- public API ----

  onEvent(cb: Listener) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onStatus(cb: (s: WSStatus) => void) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  getStatus() {
    return this.status;
  }

  isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect using a FULL URL built by the caller (recommended).
   * Example:
   *   const url = buildWsUrl(currentRoomId);
   *   wsManager.connect(url);
   */
  connect(fullUrl?: string) {
    this.url = fullUrl ?? this.buildWsUrl();
    this.shouldRun = true;
    this.open();
  }

  disconnect() {
    this.shouldRun = false;
    this.clearPing();
    this.backoff = 500; // reset backoff on clean shutdown
    if (this.ws) {
      // detach handlers to avoid leaks
      this.ws.onopen = this.ws.onclose = this.ws.onmessage = this.ws.onerror = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.setStatus('offline');
  }

  send(ev: ClientEvent) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // queue for later
      this.outbox.push(ev);
      return false;
    }
    try {
      this.ws.send(JSON.stringify(ev));
      return true;
    } catch {
      this.outbox.push(ev);
      return false;
    }
  }

  // ---- internals ----

  private setStatus(s: WSStatus) {
    if (this.status === s) return;
    this.status = s;
    for (const cb of this.statusListeners) cb(s);
  }

  private clearPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private open() {
    if (!this.url) return;

    this.setStatus('connecting');
    this.ws = new WebSocket(this.url);

    // onopen
    this.ws.onopen = () => {
      this.setStatus('connected');
      this.backoff = 500; // reset for next time

      // flush outbox
      if (this.outbox.length) {
        try {
          for (const ev of this.outbox.splice(0)) {
            this.ws!.send(JSON.stringify(ev));
          }
        } catch {
          // if flush fails, items already removed; caller will resend on demand
        }
      }

      // heartbeat
      this.clearPing();
      this.pingTimer = setInterval(() => {
        this.send({ type: 'ping' });
      }, 25000);
    };

    // onmessage (robust)
    this.ws.onmessage = async (e) => {
      try {
        let text: string;
        if (typeof e.data === 'string') {
          text = e.data;
        } else if (e.data instanceof Blob) {
          text = await e.data.text();
        } else {
          // unsupported frame type
          // console.warn('[WS] unknown frame type:', typeof e.data);
          return;
        }

        if (!text) return;

        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          // console.warn('[WS] non-JSON frame:', text);
          return;
        }

        // Alias { payload: {...} } -> { data: {...} } for client convenience
        if (parsed && parsed.type && parsed.payload && !parsed.data) {
          parsed.data = parsed.payload;
        }

        // Only dispatch if there's a type
        if (!parsed || !parsed.type) {
          // console.warn('[WS] missing "type" in message:', parsed);
          return;
        }

        // fan out
        for (const cb of this.listeners) cb(parsed as ServerEvent);
      } catch (err) {
        // console.warn('[WS] onmessage error', err);
      }
    };

    // onclose
    this.ws.onclose = (ev) => {
      this.clearPing();
      if (!this.shouldRun) {
        this.setStatus('offline');
        return;
      }
      this.setStatus('connecting');

      // capped backoff (max 5s)
      const delay = Math.min(this.backoff, 5000);
      setTimeout(() => this.open(), delay);
      this.backoff = Math.min(this.backoff * 2, 5000);
    };

    // onerror: rely on onclose for reconnect; keep logging minimal
    this.ws.onerror = () => {
      // intentionally empty
    };
  }

  /**
   * Fallback builder if caller didn't pass a full URL.
   * Uses env base + token from localStorage.
   * Does NOT add room_id (your AppShell already does when needed).
   */
  private buildWsUrl(): string {
    const baseRaw = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
    const base = new URL(baseRaw, window.location.origin);
    base.search = ''; // strip accidental queries in env
    const u = new URL(base.toString());
    const token = (localStorage.getItem('token') || '').trim();
    if (token) u.searchParams.set('token', token);
    return u.toString();
  }
}

export const wsManager = new WSManager();
