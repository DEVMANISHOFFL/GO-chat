'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Send, Wifi, WifiOff, Loader2, LogOut, Hash } from "lucide-react";
import { useAccessToken } from "@/app/hooks/useAccessToken";

// ====== CONFIG ======
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ====== Types ======
type WSStatus = "connecting" | "open" | "closed" | "error";
type RoomLite = { id: string; name: string; topic?: string };
type Message = {
  id: string;
  tempId?: string;
  roomId: string;
  userId: string;
  username?: string;
  content: string;
  createdAt: string;
  mine?: boolean;
};

type Incoming =
  | { type: "history"; roomId: string; messages: Message[] }
  | { type: "message"; message: Message }
  | { type: "ack"; tempId: string; id: string; createdAt?: string }
  | { type: "typing"; roomId: string; userId: string; username?: string }
  | { type: "error"; message: string };

type Outgoing =
  | { type: "join"; roomId: string }
  | { type: "message"; roomId: string; content: string; tempId: string }
  | { type: "typing"; roomId: string };

// ====== Utils ======
function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}
function isoNow() { return new Date().toISOString(); }
function parseJwt<T = any>(t: string | null): T | null {
  if (!t) return null;
  try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
  catch { return null; }
}

// ====== API helpers ======
async function listRooms(limit = 200): Promise<RoomLite[]> {
  const token = (localStorage.getItem("token") || "").trim();
  const url = new URL(`${API_URL}/api/chat/rooms`, window.location.origin);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString().replace(window.location.origin, ""), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rooms ${res.status}`);
  const data = await res.json();
  return (data as any[]).map((r) => ({
    id: String(r.id ?? r.roomId ?? r.RoomID ?? r.slug),
    name: String(r.name ?? r.Name ?? r.slug ?? "room"),
    topic: r.topic ?? r.Topic ?? "",
  }));
}

// ====== useWebSocket with auto-reconnect & send queue ======
function useWebSocket(url: string, token?: string) {
  const [status, setStatus] = useState<WSStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<string[]>([]);
  const reconnectRef = useRef({ attempts: 0, shouldReconnect: true });

  const connect = async () => {
    try {
      setStatus("connecting");
      const u = new URL(url);
      if (token) u.searchParams.set("token", token);
      const ws = new WebSocket(u.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("open");
        reconnectRef.current.attempts = 0;
        while (queueRef.current.length) {
          const frame = queueRef.current.shift();
          if (frame) ws.send(frame);
        }
      };
      ws.onmessage = () => {};
      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("closed");
        if (!reconnectRef.current.shouldReconnect) return;
        const attempts = ++reconnectRef.current.attempts;
        const delay = Math.min(1000 * 2 ** attempts, 15000);
        setTimeout(connect, delay);
      };
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    reconnectRef.current.shouldReconnect = true;
    connect();
    return () => {
      reconnectRef.current.shouldReconnect = false;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token]);

  const send = (data: Outgoing) => {
    const frame = JSON.stringify(data);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(frame);
    else queueRef.current.push(frame);
  };

  const subscribe = (fn: (json: Incoming) => void) => {
    const ws = wsRef.current;
    if (!ws) return () => {};
    const onmessage = (ev: MessageEvent) => {
      try { fn(JSON.parse(ev.data)); }
      catch (e) { console.warn("WS parse error", e); }
    };
    ws.addEventListener("message", onmessage);
    return () => ws.removeEventListener("message", onmessage);
  };

  return { status, send, subscribe };
}

// ====== UI bits (Bubble, Typing, InputRow, Header) – unchanged ======
function Bubble({ m }: { m: Message }) {
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={classNames("flex mb-2", m.mine ? "justify-end" : "justify-start")}>
      <div className={classNames(
        "max-w-[75%] rounded-2xl px-4 py-2 shadow-sm",
        m.mine ? "bg-purple-600 text-white rounded-br-sm" : "bg-white text-gray-900 rounded-bl-sm border"
      )}>
        {!m.mine && m.username && (
          <div className="mb-0.5 text-xs font-medium text-purple-700">{m.username}</div>
        )}
        <div className="whitespace-pre-wrap break-words">{m.content}</div>
        <div className={classNames("mt-1 text-[10px]", m.mine ? "text-purple-100" : "text-gray-500")}>{time}</div>
      </div>
    </div>
  );
}
function Typing({ who }: { who: string[] }) {
  if (!who.length) return null;
  const label = who.length === 1 ? `${who[0]} is typing…` : `${who.length} people are typing…`;
  return <div className="px-2 py-1 text-xs text-gray-600">{label}</div>;
}
function InputRow({ onSend, onTyping, disabled }: { onSend: (t: string) => void; onTyping: () => void; disabled?: boolean; }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSend = () => { const t = text.trim(); if (!t) return; onSend(t); setText(""); inputRef.current?.focus(); };
  return (
    <div className="flex items-center gap-2 border-t bg-white p-2">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        onInput={onTyping}
        placeholder="Type a message"
        className="flex-1 rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        disabled={disabled}
      />
      <button
        onClick={handleSend}
        disabled={disabled}
        className={classNames(
          "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-white shadow-sm",
          disabled ? "bg-purple-300" : "bg-purple-600 hover:bg-purple-700"
        )}
      >
        <Send className="h-4 w-4" /> Send
      </button>
    </div>
  );
}
function Header({ status, onLogout, username }: { status: WSStatus; onLogout: () => void; username?: string; }) {
  const icon = status === "open" ? <Wifi className="h-4 w-4" /> : status === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />;
  const label = status === "open" ? "Online" : status === "connecting" ? "Connecting…" : "Offline";
  return (
    <div className="flex items-center justify-between border-b bg-white p-3">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-purple-600 font-bold text-white">C</div>
        <div className="flex items-center gap-2 font-semibold">
          Chat Room <span className="inline-flex items-center gap-1 text-gray-500">{icon}{label}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-sm text-gray-700">{username ? `Hi, ${username}` : ""}</div>
        <button onClick={onLogout} className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 hover:bg-gray-50" title="Logout">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </div>
  );
}

// ====== Main Chat App (now with rooms + left panel) ======
export default function ChatApp() {
  const token = useAccessToken();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | undefined>(undefined);

  // NEW: rooms + selected room
  const [rooms, setRooms] = useState<RoomLite[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string>("");

  // Decode token → userId + username
  useEffect(() => {
    if (!token) {
      const t = setTimeout(() => { if (!localStorage.getItem("token")) window.location.href = "/login"; }, 300);
      return () => clearTimeout(t);
    }
    const claims = parseJwt<any>(token);
    const uid = claims?.user_id || claims?.userId;
    if (!uid) {
      localStorage.removeItem("token"); localStorage.removeItem("refresh_token"); localStorage.removeItem("expires_at");
      window.location.href = "/login"; return;
    }
    setUserId(uid);
    const fallback = claims?.name || claims?.username || claims?.email?.split?.("@")?.[0] || String(uid).slice(0, 8);
    setUsername((prev) => prev ?? fallback);
  }, [token]);

  // Fetch canonical /api/me
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const me = await res.json();
        setUsername(me.username || me.email?.split?.("@")?.[0] || undefined);
      } catch {}
    })();
  }, [token]);

  // NEW: fetch rooms and pick the first as current
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const all = await listRooms(200);
        setRooms(all);
        setCurrentRoomId((prev) => prev || all[0]?.id || "");
      } catch (e) {
        console.warn("listRooms failed", e);
      }
    })();
  }, [token]);

  if (!token || !userId) {
    return <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white" />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white flex">
      {/* LEFT PANEL: rooms list */}
      <aside className="hidden w-60 shrink-0 border-r bg-white md:flex md:flex-col">
        <div className="px-3 py-2 text-xs font-semibold uppercase text-gray-500">Channels</div>
        <nav className="flex-1 overflow-auto px-2 pb-2">
          {rooms.map((r) => {
            const active = r.id === currentRoomId;
            return (
              <button
                key={r.id}
                onClick={() => setCurrentRoomId(r.id)}
                className={classNames(
                  "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100",
                  active && "bg-gray-100 font-medium"
                )}
                title={r.topic || r.name}
              >
                <Hash className="h-4 w-4 opacity-70 group-hover:opacity-100" />
                <span className="truncate"># {r.name}</span>
              </button>
            );
          })}
          {!rooms.length && (
            <div className="px-2 py-1.5 text-xs text-gray-500">No rooms yet.</div>
          )}
        </nav>
      </aside>

      {/* MAIN */}
      <div className="flex w-full flex-col">
        <ChatShell
          token={token}
          userId={userId}
          username={username}
          roomId={currentRoomId || "general"} 
        />
      </div>
    </div>
  );
}

function ChatShell({ token, userId, username, roomId }: { token: string; userId: string; username?: string; roomId: string; }) {
  const { status, send, subscribe } = useWebSocket(WS_URL, token);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingWho, setTypingWho] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const handleLogout = useCallback(async () => {
    try {
      const refresh = localStorage.getItem("refresh_token") || "";
      if (refresh) {
        await fetch(`${API_URL}/api/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ refresh_token: refresh }),
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem("token"); localStorage.removeItem("refresh_token"); localStorage.removeItem("expires_at");
      window.location.href = "/login";
    }
  }, [token]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages.length]);

  useEffect(() => {
    const unsub = subscribe((json) => {
      if (json.type === "history") {
        const withMine = json.messages.map((m) => ({ ...m, mine: m.userId === userId }));
        setMessages(withMine);
      } else if (json.type === "message") {
        setMessages((cur) => [...cur, { ...json.message, mine: json.message.userId === userId }]);
      } else if (json.type === "ack") {
        setMessages((cur) =>
          cur.map((m) => (m.tempId === json.tempId ? { ...m, id: json.id, createdAt: json.createdAt || m.createdAt } : m))
        );
      } else if (json.type === "typing") {
        if (json.userId === userId) return;
        setTypingWho((cur) => {
          const name = json.username || "Someone";
          if (cur.includes(name)) return cur;
          return [...cur, name];
        });
        setTimeout(() => setTypingWho((cur) => cur.filter((n) => n !== (json.username || "Someone"))), 3000);
      }
    });
    return () => unsub();
  }, [subscribe, userId]);

  // Join the selected room whenever it changes
  useEffect(() => {
    if (status === "open" && roomId) {
      setMessages([]); // clear when switching rooms (optional)
      send({ type: "join", roomId });
    }
  }, [status, roomId, send]);

  const onSend = (content: string) => {
    if (!roomId) return;
    const tempId = crypto.randomUUID();
    const optimistic: Message = {
      id: `temp-${tempId}`,
      tempId,
      roomId,
      userId,
      username,
      content,
      createdAt: isoNow(),
      mine: true,
    };
    setMessages((cur) => [...cur, optimistic]);
    send({ type: "message", roomId, content, tempId });
  };

  const onTyping = useMemo(() => {
    let last = 0;
    return () => {
      const now = Date.now();
      if (now - last > 1500 && roomId) {
        send({ type: "typing", roomId });
        last = now;
      }
    };
  }, [roomId, send]);

  return (
    <div className="mx-auto my-4 w-full max-w-4xl rounded-3xl border bg-white/60 shadow-sm backdrop-blur">
      <Header status={status} onLogout={handleLogout} username={username} />

      <div ref={listRef} className="h-[60vh] overflow-y-auto bg-gradient-to-b from-white to-purple-50 p-3">
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
        <Typing who={typingWho} />
      </div>

      <InputRow onSend={onSend} onTyping={onTyping} disabled={status !== "open" || !roomId} />
    </div>
  );
}
