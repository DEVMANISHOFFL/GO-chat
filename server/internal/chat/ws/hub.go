package ws

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

// Hub manages active websocket clients and subscriptions.
type Hub struct {
	register   chan *Client
	unregister chan *Client
	inbound    chan Event
	// optional system channel — e.g., events from services/persistence
	system chan Event

	clients      map[*Client]struct{}
	userConns    map[string]map[*Client]struct{} // userID -> clients
	channelSubs  map[string]map[*Client]struct{} // channelID -> clients
	mu           sync.RWMutex
	shutdownOnce sync.Once
	ctx          context.Context
	cancel       context.CancelFunc
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	return &Hub{
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		inbound:     make(chan Event, 1024),
		system:      make(chan Event, 256),
		clients:     make(map[*Client]struct{}),
		userConns:   make(map[string]map[*Client]struct{}),
		channelSubs: make(map[string]map[*Client]struct{}),
		ctx:         ctx,
		cancel:      cancel,
	}
}

func (h *Hub) RegisterClient(c *Client) {
	h.register <- c
}

func (h *Hub) UnregisterClient(c *Client) {
	h.unregister <- c
}

// Run starts the hub event loop. Call as goroutine.
func (h *Hub) Run() {
	ticker := time.NewTicker(30 * time.Second) // can be used for periodic tasks
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
			// placeholder for periodic cleanup if needed
		}
	}
}

// Shutdown gracefully stops the hub.
func (h *Hub) Shutdown(ctx context.Context) {
	h.shutdownOnce.Do(func() {
		h.cancel()
		<-ctx.Done() // allow caller to manage timeout; simple signaling here
	})
}

// addClient registers a client.
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
	// optional: join default channels
}

// removeClient unregisters a client and unsubscribes from channels.
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
	// Remove from all channel subscriptions
	for chID := range c.subscriptions {
		if set, ok := h.channelSubs[chID]; ok {
			delete(set, c)
			if len(set) == 0 {
				delete(h.channelSubs, chID)
			}
		}
	}
}

// routeEvent decides how to broadcast an event.
func (h *Hub) routeEvent(ev Event) {
	// Server should set server ts if not set
	if ev.ServerTs == 0 {
		ev.ServerTs = int64(time.Now().Unix())
	}

	switch {
	case ev.To == "":
		// broadcast to all clients
		h.broadcastAll(ev)
	default:
		// Decide if 'To' is a user or channel ID by convention.
		// Most implementations will use a prefix or context-based routing.
		// For now: try user, then channel.
		if h.broadcastToUser(ev.To, ev) {
			return
		}
		h.broadcastToChannel(ev.To, ev, "")
	}
}

// broadcastAll sends an event to every active client.
func (h *Hub) broadcastAll(ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		h.SafeSend(c, ev)
	}
}

// broadcastToUser returns true if it found user conns and sent.
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

// broadcastToChannel sends to all subscribers of channelID.
// excludeClientID can be supplied to not send to a specific client (e.g., sender).
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

// safeSend attempts to enqueue the event; on overflow it applies a policy.
func (h *Hub) SafeSend(c *Client, ev Event) {
	// Lightweight marshal to bytes; clients accept JSON bytes
	b, err := json.Marshal(&ev)
	if err != nil {
		// log optionally
		return
	}
	select {
	case c.send <- b:
		// enqueued
	default:
		// queue full: policy — close the connection (to keep hub healthy)
		// Alternatively, drop low-priority events here.
		close(c.send)
		h.unregister <- c
	}
}

// Subscribe associates a client with a channel ID.
func (h *Hub) Subscribe(c *Client, channelID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.channelSubs[channelID]; !ok {
		h.channelSubs[channelID] = make(map[*Client]struct{})
	}
	h.channelSubs[channelID][c] = struct{}{}
	c.subscriptions[channelID] = struct{}{}
}

// Unsubscribe removes client subscription.
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

// drainAndClose force-closes all clients and drains channels.
func (h *Hub) drainAndClose() {
	h.mu.Lock()
	clients := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()

	for _, c := range clients {
		close(c.send)
		c.conn.Close()
	}
}
