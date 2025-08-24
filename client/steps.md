step 0 — project setup & guardrails

Deliverables

Tech baseline: Next.js app, Tailwind, shadcn/ui, framer-motion, lucide icons, state/query lib (React Query or equivalent), date/format utils.

Theme: dark default, purple/white accent (your preference), light mode toggle.

Design tokens: spacing, radius, shadows, text styles, z-index map.

Global UI: toasts, modal/sheet primitives, skeletons, error boundary.
Acceptance

App boots on desktop/mobile, dark/light toggle works, sample toast/skeleton/error shown via UI demo page.

step 1 — app shell, routing, and navigation

Deliverables

Layout: left server/workspace rail, channel rail, main content, right panel placeholder.

Routes: /rooms/:roomId, /dm/:userId, /threads/:messageId, /search.

Keyboard: ⌘/Ctrl+K opens global switcher; arrow keys navigate lists.

URL state: current room/thread reflected in URL; drafts and scroll restored per room.
Acceptance

Navigating via sidebar updates URL and view; resizing to mobile swaps to drawer/tab layout without jank.

step 2 — auth UI (hooks into your backend)

Deliverables

Sign in/up, forgotten password, logout.

Session handling: token storage, refresh, guarded routes, expired token modal.

Basic profile sheet (avatar, display name).
Acceptance

Protected routes redirect when signed out; re-auth flow returns user to the same room.

step 3 — data layer & contracts

Deliverables

API client scaffolding (REST shapes) and WS client with retry/backoff.

Normalized cache for rooms, messages, members; optimistic mutation patterns.

Error mapping (server → user-friendly).
Acceptance

Network tab shows typed requests; mock rooms/messages hydrate into UI components.

step 4 — message timeline (static first)

Deliverables

Virtualized MessageList (day dividers, “new messages” marker, system messages).

Message variants: text, edited, deleted tombstone, reply/thread starter preview.

Time formatting, hover actions placeholder (react, reply, edit, delete).
Acceptance

10k+ mock messages scroll smoothly; “jump to present” and “scroll to messageId” work.

step 5 — composer UX

Deliverables

Multiline autosize input, Enter=send / Shift+Enter=newline.

Toolbar: emoji, attachments, slash-commands, mentions (@user, #channel).

Draft persistence per room; validation (size/type), error toasts.
Acceptance

Drafts restore when switching rooms; sending inserts a pending message row that resolves.

step 6 — realtime connection & basic messaging

Deliverables

WS connect status banner; backoff/retry.

message.created/updated/deleted handling; optimistic send with retry/outbox.

Offline mode: queue sends, disable composer with helpful tips.
Acceptance

Two browser tabs see sends/edits/deletes live; offline tab syncs on reconnect.

step 7 — history, pagination, and jump logic

Deliverables

Infinite scroll up (before cursor), maintain scroll anchor.

“Jump to first unread”, “mark as read”, “mark all read”.

Linkable deep jumps: ?at=<messageId> with pulsing highlight.
Acceptance

Loading older messages preserves viewport position; unread counts match lastRead.

step 8 — presence & typing indicators

Deliverables

Member list with presence dots; avatar rings in timeline for active users.

Typing indicators with debounce and idle timeout.
Acceptance

Typing shows in room only for active typers; presence updates within expected intervals.

step 9 — read receipts & unread logic

Deliverables

Per-room unread badge; lastRead marker in timeline.

Per-message read receipts (if your backend supports), privacy toggle in settings.
Acceptance

Switching focus moves lastRead; receipts update across two clients predictably.

step 10 — uploads & media

Deliverables

Drag-drop/paste attachments; preview (images/docs), progress, cancel/retry.

Lightbox for images; file chips with size/type; safe download.

Server-side thumbnail use; client lazy-load.
Acceptance

Large file shows progress and retry; failed upload displays actionable error.

step 11 — search (global + in-room)

Deliverables

⌘/Ctrl+K quick switcher with recent rooms/DMs and people.

Search panel: query, filters (from:, in:, has:file/link, before/after), results with jump.
Acceptance

Typing queries returns paginated results; clicking a result jumps and highlights.

step 12 — moderation & message actions

Deliverables

Message actions: edit, delete (confirm), copy link, pin, report.

Role-based UI gating (admin/mod/member); pinned items tab in right panel.
Acceptance

Non-admins can’t see restricted actions; pins appear instantly for all.

step 13 — right panel utilities

Deliverables

Tabs: Members / Thread / Pinned / Room Info (topic/description).

Thread view as focused sub-timeline with composer.
Acceptance

Starting a thread opens right panel; counts/badges reflect new thread replies.

step 14 — performance polish

Deliverables

Render profiling, memoization, list window tuning, image decode hints.

Code-split heavy modals (emoji picker, upload preview).

Accessibility pass: roles, labels, contrast, reduced motion.
Acceptance

Smooth scroll on mid-tier device; Lighthouse a11y ≥ 95; interaction latency < 100ms on common actions.

step 15 — QA, telemetry, and release kit

Deliverables

Test matrix (desktop/mobile, light/dark, slow/fast networks).

Basic analytics: page/room views, send attempts/success, WS reconnects.

Crash/exception reporting wired to error boundary.
Acceptance

No critical issues across the matrix; dashboards show live events.

how we’ll execute (repeatable loop per step)

lock scope (above), 2) wire mock → live data, 3) test with 2 tabs + mobile, 4) check acceptance list, 5) move on.

starting now: step 0 checklist (what I’ll produce)

palette + tokens (purple/white accent), dark/light themes

toast/skeleton/error demos

modal/sheet primitives

z-index & spacing scale doc

keyboard shortcut registry (reserved combos)