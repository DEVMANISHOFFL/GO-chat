# Chat Backend — Full Documentation & Progress Log

## 1) Executive Summary

This document is a detailed, end-to-end log of the chat backend we built together. It covers:
- Architecture & stack
- Database schema (Scylla/CQL) and reasoning
- Go modules (auth, chat, ws) and key functions
- HTTP endpoints (signup/login/refresh/logout/me, rooms, messages)
- WebSocket design (events, hub, client, subscriptions, persistence)
- Testing recipes (copy-paste cURL/wscat/websocat)
- Hard-earned troubleshooting notes and fixes
- Production notes + next roadmap

The goal is that you can re-read this later and quickly reconstruct or extend the system.

---

## 2) Architecture Overview

**Stack**
- **Go** backend (modular: `auth`, `chat`, `ws`)
- **ScyllaDB** (Cassandra-compatible CQL) for durable data (users, tokens, rooms, messages)
- **Redis** (reserved for presence/rate-limit; initialized in server; optional for now)
- **HTTP** (REST) + **WebSocket** (real-time)
- **JWT** access tokens + **rotating refresh tokens** (stored in Scylla)

**High-level flow**
1. User signs up (unique username & email via **LWT reservations** in Cassandra).
2. User logs in → gets **JWT** + **refresh token** (refresh is persisted).
3. Protected endpoints use `Authorization: Bearer <JWT>`.
4. Token refresh rotates refresh token (old one invalidated).
5. WebSocket clients connect with `?token=<JWT>` (or `Authorization: Bearer …`), subscribe to a room, send/receive messages in real time. Messages are **also persisted** to Scylla via an injected callback.

---

## 3) Database Schema (CQL) & Rationale

We optimized for **read scalability** and **write correctness** under Scylla.

### 3.1 Users & Uniqueness
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT,
  email TEXT,
  password TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users_by_email (
  email TEXT PRIMARY KEY,
  user_id UUID
);

CREATE TABLE IF NOT EXISTS users_by_username (
  username TEXT PRIMARY KEY,
  user_id UUID
);
```

**Why**  
Avoid ALLOW FILTERING for user lookups. We LWT-reserve (IF NOT EXISTS) email/username before inserting a user row. This enforces uniqueness at scale.

---

### 3.2 Refresh Tokens
```sql
CREATE TABLE refresh_tokens (
  user_id UUID,
  refresh_id TIMEUUID,
  refresh_token TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP,
  PRIMARY KEY (user_id, refresh_id)
);
```

**Why**  
Partition by user_id to fetch/manage a user’s tokens. We store random 32-byte hex refresh tokens with TTL logic at the app layer. Rotation is implemented (new refresh saved, old deleted).

---

### 3.3 Rooms & Messages
```sql
CREATE TABLE IF NOT EXISTS rooms (
  room_id   UUID PRIMARY KEY,
  name      TEXT,
  created_by UUID,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_messages (
  room_id    UUID,
  msg_id     TIMEUUID,
  user_id    UUID,
  content    TEXT,
  created_at TIMESTAMP,
  PRIMARY KEY ((room_id), msg_id)
);
```

**Why**  
Messages are partitioned per room. We page chronologically using msg_id (timeuuid). To get newest first we use ORDER BY msg_id DESC at query time.

---

## 4) Go Modules & Important Functions

### 4.1 Auth Module

**Repository**
- `InsertUser(u *User)` — inserts into users  
- `ReserveEmail(email, id)` / `ReserveUsername(username, id)` — ScanCAS with LWT  
- `ReleaseEmail/ReleaseUsername` — rollback reservations on failure  
- `GetUserByEmailOrUsername(value)` — 2-step lookup (via users_by_email/users_by_username → users)  
- `SaveRefreshToken(rt *RefreshToken)` — persists refresh token  
- `GetRefreshTokenByToken(userID, token)` — (ALLOW FILTERING for now)  
- `DeleteRefreshToken(userID, refreshID)` / `DeleteRefreshByToken(userID, token)`  

**Service**
- **Signup** — validate, hash password, LWT reserve username/email, insert user, rollback on error  
- **Login** — verify password, issue JWT (HS256), save refresh  
- **Refresh** — validate refresh, issue new JWT and rotate refresh (insert new, delete old)  
- **Logout** — delete specific refresh token (session revoke)  
- **Me** — return full user profile  

**Middleware**
- `AuthMiddleware` — validate JWT, put user_id in request context  

**Utils**
- `GenerateJWT(userID, expiry)` & `ValidateJWT(token)` (checks alg; secret to env)  
- `GenerateRefreshToken(userID)` — 32 bytes crypto-random; 7-day expiry  

**Handlers / Routes**
- `POST /signup`
- `POST /login`
- `POST /api/refresh` (protected)
- `POST /api/logout` (protected)
- `GET /api/me` and `GET /api/profile` (protected)

**Security notes**
- JWT secret: move to env (`JWT_SECRET`)  
- Consider hashing refresh tokens at rest

---

### 4.2 Server (main.go)
- Loads env config  
- Initializes DB (Scylla, Redis)  
- Health endpoints: `/healthz`, `/readyz`  
- Wires routers for auth + chat + ws  

---

### 4.3 Chat (HTTP)

**Rooms**
- `POST /api/chat/rooms` — create (requires JWT)  
- `GET /api/chat/rooms` — list  

**Messages**
- `POST /api/chat/rooms/{room_id}/messages` — send (persists)  
- `GET /api/chat/rooms/{room_id}/messages?limit=&before=` — list (pagination)  

---

### 4.4 WebSocket (Realtime)

Generic `ws` package (internal/ws/):  
- **Hub** — manages clients, user connections, subscriptions  
- **Client** — read/write pumps (JSON events)  
- **Event** — canonical JSON envelope  

Example Event:
```json
{
  "type": "chat.message",
  "from": "<user_id_uuid>",
  "to":   "<room_id_uuid>",
  "payload": { "text": "hello" },
  "server_ts": 1756024792
}
```

**Persistence callback (injected from main.go):**
```go
persist := func(roomID, userID gocql.UUID, text string, ts time.Time) error {
    return chatRepo.InsertMessage(&chat.Message{
        RoomID: roomID, MsgID: gocql.TimeUUID(), UserID: userID,
        Content: text, CreatedAt: ts,
    })
}
hub := ws.NewHub(persist)
```

**routeEvent**  
- `"channel.subscribe"` / `"channel.unsubscribe"` → manage room subs  
- `"chat.message"` → persist + broadcast  
- default → broadcast helpers  

**WS HTTP entrypoint**  
`GET /ws?token=<JWT>[&room_id=<uuid>]`  
Token accepted via query string or header. Auto-subscribe optional.  

---

## 5) Testing Recipes

### 5.1 Health
```bash
curl -i http://localhost:8080/healthz
curl -i http://localhost:8080/readyz
```

### 5.2 Signup → Login → Me → Refresh → Logout
```bash
# signup
curl -i -X POST http://localhost:8080/signup   -H "Content-Type: application/json"   -d '{"username":"bob","email":"bob@example.com","password":"secret12"}'
```

(…login, refresh, logout flows with curl/python one-liners…)  

### 5.3 Rooms & Messages
(Create room, send messages, list newest-first)  

### 5.4 WebSocket (wscat)
Two terminals: connect, subscribe, send `chat.message`, verify persistence.

---

## 6) Troubleshooting Notes
- `WITH CLUSTERING ORDER BY` failed → removed, use ORDER BY at query time  
- Column mismatch (token vs refresh_token) → fixed schema  
- ALLOW FILTERING → replaced with lookup tables  
- LWT ScanCAS error → must pass variables  
- JWT role undefined → removed claim  
- 401 Unauthorized → must send real token, not `<JWT>`  
- No jq → used Python one-liners  
- WebSocket invalid_event → exact JSON required, no placeholders  
- Import cycles (chat ↔ ws) → solved with callback injection  
- websocat binary issue → switched to `wscat`  

---

## 7) Production Notes
- Env secrets (`JWT_SECRET`)  
- Hash refresh tokens at rest (optional)  
- Rate limiting (Redis)  
- CORS restrictions  
- Logging, metrics, observability  
- CI/CD pipeline + DB migrations  
- Presence (Redis sets, TTL)  
- TTL/indexing for ephemeral rooms  

---

## 8) Roadmap
- Typing indicators (WS events)  
- Presence API (Redis)  
- Rate limiting  
- Attachments (S3)  
- Message edits/deletes  
- Search (Elastic/OpenSearch)  
- Observability dashboards  
- Kubernetes + Redis Pub/Sub for scaling  

---

## 9) Changelog (in order)
1. Fixed CQL syntax; created tables  
2. Implemented signup/login + JWT middleware  
3. Added health/readiness + env config  
4. Added refresh/logout with rotation/revoke  
5. Replaced ALLOW FILTERING with lookup tables + LWT  
6. Added `/api/me`  
7. Created rooms/messages tables, HTTP APIs  
8. Added WebSocket hub/client/events with persistence callback  
9. Added channel.subscribe/unsubscribe events  
10. End-to-end tested with curl + wscat  

---

## 10) Glossary
- **LWT** — Lightweight Transaction (`IF NOT EXISTS`), Paxos-based uniqueness  
- **ScanCAS** — gocql API to check [applied] + read existing values  
- **TIMEUUID** — UUIDv1, sortable by time, great for messages  
- **JWT** — JSON Web Token (HS256 short-lived access)  
- **Refresh Token** — long random secret persisted; rotated per use  
- **Hub** — central WS broadcast manager (clients/users/channels)  

---

**End of Document — Happy hacking!**
