"use client"

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, Wifi, WifiOff, Loader2, LogIn, LogOut } from "lucide-react";

/**
 * Minimal, production-ready-ish chat frontend you can drop into a Next.js app.
 * - Tailwind-only UI (purple/white theme)
 * - Clean message list + input + typing indicator
 * - Robust WebSocket hook with auto-reconnect + send queue
 * - JWT via query param (?token=) for now; swap to header/cookie if you proxy
 * - Simple JSON protocol (see PROTOCOL notes at bottom)
 *
 * HOW TO USE (Next.js App Router):
 * 1) Ensure Tailwind is configured.
 * 2) Create a file like app/chat/page.tsx and export default <ChatApp />.
 * 3) Set WS_URL to your backend WS endpoint (wss:// or ws://).
 * 4) Pass a JWT/token (or wire your auth state) and a roomId.
 */

// ====== CONFIG ======
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws"; // change to your Go server ws endpoint

// ====== Types ======

type WSStatus = "connecting" | "open" | "closed" | "error";

type Message = {
  id: string; // server id
  tempId?: string; // client temp id for optimistic UI
  roomId: string;
  userId: string;
  username?: string;
  content: string;
  createdAt: string; // ISO string
  mine?: boolean; // UI helper
};

type Incoming
  = { type: "history"; roomId: string; messages: Message[] }
  | { type: "message"; message: Message }
  | { type: "ack"; tempId: string; id: string; createdAt?: string }
  | { type: "typing"; roomId: string; userId: string; username?: string }
  | { type: "error"; message: string };

type Outgoing
  = { type: "join"; roomId: string }
  | { type: "message"; roomId: string; content: string; tempId: string }
  | { type: "typing"; roomId: string };

// ====== Utils ======
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isoNow() {
  return new Date().toISOString();
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
      // token via query param (simple). Prefer secure cookie or header via proxy in prod.
      const u = new URL(url);
      if (token) u.searchParams.set("token", token);
      const ws = new WebSocket(u.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("open");
        reconnectRef.current.attempts = 0;
        // flush queued frames
        while (queueRef.current.length) {
          const frame = queueRef.current.shift();
          if (frame) ws.send(frame);
        }
      };

      ws.onmessage = () => {
        // handled externally via subscribe() API below
      };

      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("closed");
        if (!reconnectRef.current.shouldReconnect) return;
        // exponential backoff
        const attempts = ++reconnectRef.current.attempts;
        const delay = Math.min(1000 * 2 ** attempts, 15000);
        setTimeout(connect, delay);
      };
    } catch (e) {
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
      try {
        const json: Incoming = JSON.parse(ev.data);
        fn(json);
      } catch (e) {
        console.warn("WS parse error", e);
      }
    };
    ws.addEventListener("message", onmessage);
    return () => ws.removeEventListener("message", onmessage);
  };

  return { status, send, subscribe };
}

// ====== Message Bubble ======
function Bubble({ m }: { m: Message }) {
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={classNames("flex mb-2", m.mine ? "justify-end" : "justify-start")}>      
      <div
        className={classNames(
          "max-w-[75%] rounded-2xl px-4 py-2 shadow-sm",
          m.mine ? "bg-purple-600 text-white rounded-br-sm" : "bg-white text-gray-900 rounded-bl-sm border"
        )}
      >
        {!m.mine && m.username && (
          <div className="text-xs font-medium text-purple-700 mb-0.5">{m.username}</div>
        )}
        <div className="whitespace-pre-wrap break-words">{m.content}</div>
        <div className={classNames("text-[10px] mt-1", m.mine ? "text-purple-100" : "text-gray-500")}>{time}</div>
      </div>
    </div>
  );
}

// ====== Typing indicator ======
function Typing({ who }: { who: string[] }) {
  if (!who.length) return null;
  const label = who.length === 1 ? `${who[0]} is typing…` : `${who.length} people are typing…`;
  return (
    <div className="text-xs text-gray-600 px-2 py-1">{label}</div>
  );
}

// ====== Input Row ======
function InputRow({
  onSend,
  onTyping,
  disabled,
}: {
  onSend: (text: string) => void;
  onTyping: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-2 p-2 border-t bg-white">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
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
        <Send className="h-4 w-4" />
        Send
      </button>
    </div>
  );
}

// ====== Header ======
function Header({ status, onLogout, username }: { status: WSStatus; onLogout?: () => void; username?: string }) {
  const icon = status === "open" ? <Wifi className="h-4 w-4" /> : status === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />;
  const label = status === "open" ? "Online" : status === "connecting" ? "Connecting…" : "Offline";
  return (
    <div className="flex items-center justify-between p-3 border-b bg-white">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-xl bg-purple-600 text-white grid place-items-center font-bold">C</div>
        <div>
          <div className="font-semibold">Chat Room</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {username && <div className="text-sm text-gray-700">Hi, {username}</div>}
        {onLogout && (
          <button onClick={onLogout} className="inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 hover:bg-gray-50">
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        )}
      </div>
    </div>
  );
}

// ====== Auth stub (replace with your real auth) ======
function AuthGate({ onLogin }: { onLogin: (token: string, userId: string, username: string) => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");

  return (
    <div className="max-w-sm w-full mx-auto mt-24 bg-white rounded-2xl p-6 shadow">
      <div className="text-center mb-4">
        <div className="h-12 w-12 rounded-2xl bg-purple-600 text-white grid place-items-center mx-auto font-bold text-lg">C</div>
        <h1 className="mt-3 text-xl font-semibold">Sign in to Chat</h1>
        <p className="text-sm text-gray-600">Paste a JWT (temporary) or wire your auth.</p>
      </div>
      <div className="space-y-3">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="w-full rounded-xl border px-3 py-2" />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username (shown in chat)" className="w-full rounded-xl border px-3 py-2" />
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="JWT / Access Token" className="w-full rounded-xl border px-3 py-2" />
        <button
          onClick={() => {
            const uid = crypto.randomUUID();
            onLogin(token || "dev-token", uid, username || email.split("@")[0] || "guest");
          }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
        >
          <LogIn className="h-4 w-4" /> Continue
        </button>
      </div>
    </div>
  );
}

// ====== Main Chat App ======
export default function ChatApp() {
  // Replace with your real auth state
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | undefined>(undefined);

  const roomId = "general"; // make dynamic if you have multiple rooms

  if (!token || !userId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-4">
        <AuthGate
          onLogin={(t, uid, uname) => {
            setToken(t);
            setUserId(uid);
            setUsername(uname);
          }}
        />
      </div>
    );
  }

  return (
    <ChatShell token={token} userId={userId} username={username} roomId={roomId} onLogout={() => { setToken(null); setUserId(null); }} />
  );
}

function ChatShell({ token, userId, username, roomId, onLogout }: { token: string; userId: string; username?: string; roomId: string; onLogout: () => void; }) {
  const { status, send, subscribe } = useWebSocket(WS_URL, token);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingWho, setTypingWho] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // auto-scroll on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // subscribe to WS frames
  useEffect(() => {
    const unsub = subscribe((json) => {
      if (json.type === "history") {
        const withMine = json.messages.map((m) => ({ ...m, mine: m.userId === userId }));
        setMessages(withMine);
      } else if (json.type === "message") {
        setMessages((cur) => [...cur, { ...json.message, mine: json.message.userId === userId }]);
      } else if (json.type === "ack") {
        setMessages((cur) => cur.map((m) => (m.tempId === json.tempId ? { ...m, id: json.id, createdAt: json.createdAt || m.createdAt } : m)));
      } else if (json.type === "typing") {
        // show typing for 3s
        if (json.userId === userId) return;
        setTypingWho((cur) => {
          const name = json.username || "Someone";
          if (cur.includes(name)) return cur;
          return [...cur, name];
        });
        setTimeout(() => setTypingWho((cur) => cur.filter((n) => n !== (json.username || "Someone"))), 3000);
      } else if (json.type === "error") {
        console.warn("Server error:", json.message);
      }
    });
    return () => unsub();
  }, [subscribe, userId]);

  // join room on connect
  useEffect(() => {
    if (status === "open") {
      send({ type: "join", roomId });
    }
  }, [status, roomId, send]);

  const onSend = (content: string) => {
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
      if (now - last > 1500) {
        send({ type: "typing", roomId });
        last = now;
      }
    };
  }, [roomId, send]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white flex flex-col">
      <div className="max-w-4xl w-full mx-auto my-4 rounded-3xl overflow-hidden border shadow-sm bg-white/60 backdrop-blur">
        <Header status={status} onLogout={onLogout} username={username} />

        {/* Messages */}
        <div ref={listRef} className="h-[60vh] overflow-y-auto p-3 bg-gradient-to-b from-white to-purple-50">
          {messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
          <Typing who={typingWho} />
        </div>

        <InputRow onSend={onSend} onTyping={onTyping} disabled={status !== "open"} />
      </div>

      {/* Footer / Protocol hints */}
      <div className="mx-auto max-w-4xl w-full text-[11px] text-gray-500 px-3 pb-6">
        <div className="rounded-2xl bg-white border p-3">
          <div className="font-semibold mb-1">Protocol (expected WS frames)</div>
          <pre className="whitespace-pre-wrap break-words">{`
Client → Server
  {"type":"join","roomId":"${"general"}"}
  {"type":"message","roomId":"${"general"}","content":"Hi","tempId":"uuid"}
  {"type":"typing","roomId":"${"general"}"}

Server → Client
  {"type":"history","roomId":"${"general"}","messages":[Message,...]}
  {"type":"message","message":Message}
  {"type":"ack","tempId":"uuid","id":"server-id","createdAt":"ISO"}
  {"type":"typing","roomId":"${"general"}","userId":"u1","username":"Alice"}
`}</pre>
        </div>
      </div>
    </div>
  );
}
