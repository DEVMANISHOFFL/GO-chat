package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gocql/gocql"
	"github.com/google/uuid"
)

// PersistMessageFunc allows the hub to persist chat messages.
type PersistMessageFunc func(roomID, userID gocql.UUID, text string, createdAt time.Time) error

type Hub struct {
	register   chan *Client
	unregister chan *Client
	inbound    chan Event
	system     chan Event

	clients     map[*Client]struct{}
	userConns   map[string]map[*Client]struct{}
	channelSubs map[string]map[*Client]struct{}
	mu          sync.RWMutex

	shutdownOnce sync.Once
	ctx          context.Context
	cancel       context.CancelFunc

	persistMessage PersistMessageFunc
	Presence       interface {
		Touch(ctx context.Context, roomID, userID string) error
	}
}

func NewHub(persist PersistMessageFunc) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	return &Hub{
		register:       make(chan *Client),
		unregister:     make(chan *Client),
		inbound:        make(chan Event, 1024),
		system:         make(chan Event, 256),
		clients:        make(map[*Client]struct{}),
		userConns:      make(map[string]map[*Client]struct{}),
		channelSubs:    make(map[string]map[*Client]struct{}),
		ctx:            ctx,
		cancel:         cancel,
		persistMessage: persist,
	}
}

func (h *Hub) RegisterClient(c *Client)   { h.register <- c }
func (h *Hub) UnregisterClient(c *Client) { h.unregister <- c }

// helper: first client ID for a user (to exclude echo to sender in room fanout)
func (h *Hub) firstClientIDForUser(userID string) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if set, ok := h.userConns[userID]; ok {
		for c := range set {
			return c.ID
		}
	}
	return ""
}

// internal broadcast entry point (global/user/room)
func (h *Hub) broadcast(ev Event) {
	if ev.To == "" {
		h.broadcastAll(ev)
		return
	}
	if h.broadcastToUser(ev.To, ev) {
		return
	}
	h.broadcastToChannel(ev.To, ev, "")
}

// Run starts the hub loop.
func (h *Hub) Run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-h.ctx.Done():
			h.drainAndClose()
			return

		case c := <-h.register:
			h.addClient(c)

		case c := <-h.unregister:
			h.removeClient(c)

		case ev := <-h.inbound:
			h.routeEvent(ev)

		case ev := <-h.system:
			h.routeEvent(ev)

		case <-ticker.C:
			// periodic maintenance (optional)
		}
	}
}

// Shutdown gracefully stops the hub (call from server shutdown path).
func (h *Hub) Shutdown(ctx context.Context) {
	h.shutdownOnce.Do(func() {
		h.cancel()
		<-ctx.Done()
	})
}

// --- Client registry / rooms ---

func (h *Hub) addClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.clients[c] = struct{}{}

	if c.UserID != "" {
		if _, ok := h.userConns[c.UserID]; !ok {
			h.userConns[c.UserID] = make(map[*Client]struct{})
		}
		h.userConns[c.UserID][c] = struct{}{}
	}

	// Optional: send conn.ack
	ack := NewServerEvent("conn.ack", "server", c.UserID, map[string]any{
		"client_id":    c.ID,
		"connected_at": time.Now().Unix(),
	})
	h.SafeSend(c, ack)
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	delete(h.clients, c)

	if c.UserID != "" {
		if set, ok := h.userConns[c.UserID]; ok {
			delete(set, c)
			if len(set) == 0 {
				delete(h.userConns, c.UserID)
			}
		}
	}

	for chID := range c.subscriptions {
		if set, ok := h.channelSubs[chID]; ok {
			delete(set, c)
			if len(set) == 0 {
				delete(h.channelSubs, chID)
			}
		}
	}
}

// --- Core routing ---

func (h *Hub) routeEvent(ev Event) {
	// Ensure server timestamp present
	if ev.ServerTs == 0 {
		ev.ServerTs = time.Now().Unix()
	}

	switch ev.Type {

	// ===== Presence + typing =====
	case "typing.start":
		if ev.From == "" || ev.To == "" {
			return
		}
		exclude := h.firstClientIDForUser(ev.From)
		out := Event{
			Type:     "typing.start",
			From:     ev.From,
			To:       ev.To,
			Payload:  ev.Payload,
			ServerTs: time.Now().Unix(),
		}
		h.broadcastToChannel(ev.To, out, exclude)
		if h.Presence != nil {
			_ = h.Presence.Touch(h.ctx, ev.To, ev.From)
		}
		return

	case "typing.stop":
		if ev.From == "" || ev.To == "" {
			return
		}
		exclude := h.firstClientIDForUser(ev.From)
		out := Event{
			Type:     "typing.stop",
			From:     ev.From,
			To:       ev.To,
			Payload:  ev.Payload,
			ServerTs: time.Now().Unix(),
		}
		h.broadcastToChannel(ev.To, out, exclude)
		if h.Presence != nil {
			_ = h.Presence.Touch(h.ctx, ev.To, ev.From)
		}
		return

	// ===== Channel membership (server-side subscribe API) =====
	case "channel.subscribe":
		h.mu.RLock()
		var cli *Client
		if set, ok := h.userConns[ev.From]; ok {
			for c := range set {
				cli = c
				break
			}
		}
		h.mu.RUnlock()
		if cli != nil && ev.To != "" {
			h.Subscribe(cli, ev.To)
			h.broadcastToUser(ev.From, Event{
				Type:     "channel.subscribed",
				To:       ev.To,
				From:     "server",
				Payload:  map[string]any{"channel": ev.To},
				ServerTs: time.Now().Unix(),
			})
		}
		if h.Presence != nil && ev.To != "" && ev.From != "" {
			_ = h.Presence.Touch(h.ctx, ev.To, ev.From)
		}
		return

	case "channel.unsubscribe":
		h.mu.RLock()
		var cli *Client
		if set, ok := h.userConns[ev.From]; ok {
			for c := range set {
				cli = c
				break
			}
		}
		h.mu.RUnlock()
		if cli != nil && ev.To != "" {
			h.Unsubscribe(cli, ev.To)
			h.broadcastToUser(ev.From, Event{
				Type:     "channel.unsubscribed",
				To:       ev.To,
				From:     "server",
				Payload:  map[string]any{"channel": ev.To},
				ServerTs: time.Now().Unix(),
			})
		}
		return

	// ===== Legacy: chat.message (kept for compatibility) =====
	case "chat.message":
		// Expect: ev.To=room_id (UUID), ev.From=user_id (UUID), payload["text"]=string
		roomID, err1 := gocql.ParseUUID(ev.To)
		userID, err2 := gocql.ParseUUID(ev.From)
		var text string
		if t, ok := ev.Payload["text"].(string); ok {
			text = t
		}
		if err1 == nil && err2 == nil && text != "" && h.persistMessage != nil {
			_ = h.persistMessage(roomID, userID, text, time.Now().UTC())
		}
		h.broadcastToChannel(ev.To, ev, "")
		if h.Presence != nil && ev.To != "" && ev.From != "" {
			_ = h.Presence.Touch(h.ctx, ev.To, ev.From)
		}
		return

	// ===== New flow: message.send → message.created =====
	case "message.send":
		// Expect ev.Payload: { tempId, roomId, content }
		tempID, _ := ev.Payload["tempId"].(string)
		roomID, _ := ev.Payload["roomId"].(string)
		content, _ := ev.Payload["content"].(string)

		if ev.From == "" || roomID == "" || content == "" {
			return
		}

		// Persist if configured (optional)
		if h.persistMessage != nil {
			if rid, err1 := gocql.ParseUUID(roomID); err1 == nil {
				if uid, err2 := gocql.ParseUUID(ev.From); err2 == nil {
					if err := h.persistMessage(rid, uid, content, time.Now().UTC()); err != nil {
						log.Printf("persistMessage error: %v", err)
						// Optionally notify sender
						if c := h.findClientByUser(ev.From); c != nil {
							h.SafeSend(c, NewServerEvent("error", "server", ev.From, map[string]any{
								"reason": "persist_failed",
							}))
						}
					}
				}
			}
		}

		// Create server event "message.created"
		msgID := uuid.NewString() // If DB returns ID, prefer that
		createdAt := time.Now().UTC().Format(time.RFC3339Nano)

		out := NewServerEvent("message.created", "server", roomID, map[string]any{
			"id":        msgID,
			"tempId":    tempID,
			"roomId":    roomID,
			"author":    map[string]any{"id": ev.From, "name": "User"}, // TODO: lookup name
			"content":   content,
			"createdAt": createdAt,
		})

		// Fan out to everyone in the room
		h.broadcastToChannel(roomID, out, "")
		if h.Presence != nil {
			_ = h.Presence.Touch(h.ctx, roomID, ev.From)
		}
		return

	default:
		// Fallback: global/user/room broadcast depending on ev.To
		h.broadcast(ev)
	}
}

// --- Broadcast helpers ---

func (h *Hub) broadcastAll(ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		h.SafeSend(c, ev)
	}
}

func (h *Hub) broadcastToUser(userID string, ev Event) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	set, ok := h.userConns[userID]
	if !ok {
		return false
	}
	for c := range set {
		h.SafeSend(c, ev)
	}
	return true
}

// excludeClientID: if non-empty, skip sending to that client (useful to avoid echoing sender's typing)
func (h *Hub) broadcastToChannel(channelID string, ev Event, excludeClientID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	set, ok := h.channelSubs[channelID]
	if !ok {
		return
	}
	for c := range set {
		if excludeClientID != "" && c.ID == excludeClientID {
			continue
		}
		h.SafeSend(c, ev)
	}
}

func (h *Hub) SafeSend(c *Client, ev Event) {
	b, err := json.Marshal(&ev)
	if err != nil {
		return
	}
	select {
	case c.send <- b:
	default:
		// queue full → close to protect hub health
		close(c.send)
		h.unregister <- c
	}
}

func (h *Hub) Subscribe(c *Client, channelID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.channelSubs[channelID]; !ok {
		h.channelSubs[channelID] = make(map[*Client]struct{})
	}
	h.channelSubs[channelID][c] = struct{}{}
	c.subscriptions[channelID] = struct{}{}
}

func (h *Hub) Unsubscribe(c *Client, channelID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.channelSubs[channelID]; ok {
		delete(set, c)
		if len(set) == 0 {
			delete(h.channelSubs, channelID)
		}
	}
	delete(c.subscriptions, channelID)
}

func (h *Hub) drainAndClose() {
	h.mu.Lock()
	clients := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()

	for _, c := range clients {
		close(c.send)
		_ = c.conn.Close()
	}
}

// findClientByUser returns any active client pointer for a given userID.
func (h *Hub) findClientByUser(userID string) *Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if set, ok := h.userConns[userID]; ok {
		for c := range set {
			return c
		}
	}
	return nil
}
