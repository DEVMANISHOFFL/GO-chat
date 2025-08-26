# Chat App Functionality Roadmap

This document tracks the **core and advanced functionalities** planned for the chat app.  
Each item includes details, acceptance criteria, and implementation notes.

---

## ✅ Current Functionality
- **Messaging (basic)**
  - Send/receive text messages in realtime.
- **Typing Indicators**
  - Show when another user is typing.

---

## 📌 Planned Functionalities

### Phase A — Messaging Core
1. **Message States (Sent / Delivered / Read)**
   - Track and display per-message status.
   - ✅ Acceptance: sender sees ✓, ✓✓, ✓✓ colored when read.
   - 💡 Impl: WS events `message_ack`, `message_read`; DB table for statuses.

2. **Inline Replies (Threads)**
   - Reply directly to a specific message.
   - ✅ Acceptance: reply preview chip with jump-to-original.
   - 💡 Impl: `parent_msg_id` column in `messages`.

3. **Edit & Delete Messages**
   - Allow edit within 15 mins; show “edited” label.
   - Soft-delete messages with tombstone placeholder.

---

### Phase B — Presence & Organization
4. **User Presence (Online / Last Seen)**
   - Show live presence and last seen.
   - ✅ Acceptance: green dot if heartbeat <60s; show "last seen X mins ago".
   - 💡 Impl: WS heartbeats → Redis; persist snapshots to DB.

5. **Groups & Roles**
   - Create group chats with admin/mod roles.
   - ✅ Acceptance: admins can add/remove members.
   - 💡 Impl: `rooms`, `room_members` tables with roles.

6. **Pinned & Starred Messages**
   - Pin important messages in a thread.
   - Star messages for personal quick access.

---

### Phase C — Search & Media
7. **Full-Text Search**
   - Search messages by keyword, sender, date.
   - ✅ Acceptance: search results highlight keyword in context.
   - 💡 Impl: Postgres `tsvector` or external search engine (Meilisearch).

8. **File & Media Uploads**
   - Send/receive images, videos, docs.
   - ✅ Acceptance: upload with preview, retry/resume, download.
   - 💡 Impl: S3/MinIO with presigned URLs.

9. **Message Links (Permalinks)**
   - Shareable link to a specific message.
   - ✅ Acceptance: clicking link opens thread at correct scroll position.

---

### Phase D — AI Enhancements
10. **Summarize Conversation**
    - Generate AI summary of last N messages.
    - ✅ Acceptance: 2–3 bullet summary within 2s.
    - 💡 Impl: RAG/LLM call with capped context.

11. **Smart Reply Suggestions**
    - Show 2–3 AI-suggested replies.
    - ✅ Acceptance: chips for “short / casual / formal” suggestions.

12. **Instant Translation**
    - Translate message text on demand.
    - ✅ Acceptance: per-message translate option (e.g. Hinglish ↔ Hindi ↔ English).

---

### Phase E — Privacy, Security, and UX
13. **Rate-Limiting & Spam Guards**
    - Prevent abuse with per-IP/org limits.
    - ✅ Acceptance: flood control + captcha on spike.

14. **Disappearing Messages**
    - Auto-delete messages after X hours/days.
    - ✅ Acceptance: verified purge both client + server.

15. **End-to-End Encryption**
    - Encrypt messages with per-thread keys.
    - ✅ Acceptance: encrypted payload stored; decrypted only client-side.

16. **Notifications (Web Push)**
    - Browser/mobile push for new messages.
    - ✅ Acceptance: background push with deep link into thread.

17. **Analytics Dashboard (Basic)**
    - Metrics: DAU/MAU, messages/day, busiest hours.
    - ✅ Acceptance: charts rendering live from events.

---

## 🚀 Stretch Goals (Future)
- **Voice & Video Calls (WebRTC)**
- **Stories/Status Posts**
- **Third-Party Integrations (GitHub, Drive, Notion)**
- **Gamification (XP, streaks, leaderboards)**

---

## 🔑 Notes
- Prioritize **core messaging (A, B, C)** before AI (D).  
- Implement **security & privacy (E)** to make app production-grade.  
- Keep scope realistic: deliver a polished demo-ready app before stretch features.

