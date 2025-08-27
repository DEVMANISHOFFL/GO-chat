export type WSStatus = 'connecting' | 'connected' | 'offline';
export type Listener = (ev: any) => void;

class WSManager {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private listeners = new Set<Listener>();
  private status: WSStatus = 'offline';
  private statusListeners = new Set<(s: WSStatus) => void>();
  private backoff = 500; // ms
  private shouldRun = false;
  private pingTimer: any = null;

  constructor() {
    // @ts-ignore
    if (typeof window !== 'undefined') window.__wsMgr = this;
  }

  onEvent(cb: Listener) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  onStatus(cb: (s: WSStatus) => void) { this.statusListeners.add(cb); return () => this.statusListeners.delete(cb); }
  getStatus() { return this.status; }

  private setStatus(s: WSStatus) {
    if (this.status !== s) {
      this.status = s;
      for (const cb of this.statusListeners) cb(s);
    }
  }

  connect(url?: string) {
    if (url) this.url = url;
    if (!this.url) {
      console.warn('[WS] connect() called without URL');
      return;
    }
    this.shouldRun = true;
    console.log('[WS] connect() ->', this.url);
    this.open();
  }

  disconnect() {
    console.log('[WS] disconnect()');
    this.shouldRun = false;
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    this.clearPing();
    this.setStatus('offline');
  }

  send(ev: any) {
    const open = this.ws && this.ws.readyState === WebSocket.OPEN;
    if (!open) {
      console.warn('[WS] send() dropped (not open):', ev);
      return false;
    }
    const s = JSON.stringify(ev);
    console.log('[WS][send]', s);
    this.ws!.send(s);
    return true;
  }

  private clearPing() { if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; } }

  private open() {
    if (!this.url) return;
    this.setStatus('connecting');
    console.log('[WS] opening', this.url);

    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      console.error('[WS] ctor error', e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.info('[WS] connected');
      this.setStatus('connected');
      this.backoff = 500;
      this.clearPing();
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25000);
    };

    this.ws.onmessage = (e) => {
      console.log('[WS][raw]', e.data);
      try {
        const ev = JSON.parse(e.data);
        for (const cb of this.listeners) cb(ev);
      } catch (err) {
        console.warn('[WS] parse error', err);
      }
    };

    this.ws.onclose = (ev) => {
      this.clearPing();
      console.warn('[WS] closed', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
      if (!this.shouldRun) { this.setStatus('offline'); return; }
      this.setStatus('connecting');
      this.scheduleReconnect();
    };

    this.ws.onerror = (e) => {
      console.error('[WS] error (check server logs for real reason)', e);
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(this.backoff, 5000);
    console.log('[WS] reconnect in', delay, 'ms');
    setTimeout(() => this.open(), delay);
    this.backoff *= 2;
  }
}

export const wsManager = new WSManager();