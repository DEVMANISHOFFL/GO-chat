package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gocql/gocql"
)

type PersistMessageFunc func(
	roomID, userID gocql.UUID,
	text string,
	createdAt time.Time,
	parentID *gocql.UUID,
) (gocql.UUID, error)

type UserLookupFunc func(ctx context.Context, userID gocql.UUID) (username string, err error)

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
	userLookup     UserLookupFunc
	Presence       interface {
		Touch(ctx context.Context, roomID, userID string) error
	}
}

func NewHub(persist PersistMessageFunc, lookup UserLookupFunc) *Hub {
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
		userLookup:     lookup,
	}
}

func (h *Hub) RegisterClient(c *Client)   { h.register <- c }
func (h *Hub) UnregisterClient(c *Client) { h.unregister <- c }

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

		}
	}
}

func (h *Hub) Shutdown(ctx context.Context) {
	h.shutdownOnce.Do(func() {
		h.cancel()
		<-ctx.Done()
	})
}

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

func getString(m map[string]any, key string) (string, bool) {
	if v, ok := m[key]; ok {
		if s, ok2 := v.(string); ok2 {
			return s, true
		}
	}
	return "", false
}

func (h *Hub) routeEvent(ev Event) {

	if ev.ServerTs == 0 {
		ev.ServerTs = time.Now().Unix()
	}

	switch ev.Type {

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

	case "message.send":

		tempID, _ := ev.Payload["tempId"].(string)
		roomIDStr, _ := ev.Payload["roomId"].(string)
		content, _ := ev.Payload["content"].(string)
		pParentStr, _ := ev.Payload["parentId"].(string)
		var parentUUID *gocql.UUID
		if pParentStr != "" {
			if parsed, err := gocql.ParseUUID(pParentStr); err == nil {
				parentUUID = &parsed
			}
		}

		if ev.From == "" || roomIDStr == "" || content == "" {
			return
		}

		rid, err1 := gocql.ParseUUID(roomIDStr)
		uid, err2 := gocql.ParseUUID(ev.From)
		if err1 != nil || err2 != nil {
			return
		}

		var dbMsgID gocql.UUID
		if h.persistMessage != nil {
			id, err := h.persistMessage(rid, uid, content, time.Now().UTC(), parentUUID)
			if err != nil {
				log.Printf("persistMessage error: %v", err)
				if c := h.findClientByUser(ev.From); c != nil {
					h.SafeSend(c, NewServerEvent("error", "server", ev.From, map[string]any{
						"reason": "persist_failed",
					}))
				}
				return
			}
			dbMsgID = id
		} else {
			dbMsgID = gocql.TimeUUID()
		}

		username := ""
		if h.userLookup != nil {
			if u, err := h.userLookup(h.ctx, uid); err == nil {
				username = u
			} else {
				log.Printf("userLookup error for %s: %v", uid.String(), err)
			}
		}

		createdAt := time.Now().UTC().Format(time.RFC3339Nano)

		payload := map[string]any{
			"id":        dbMsgID.String(),
			"tempId":    tempID,
			"roomId":    roomIDStr,
			"author":    map[string]any{"id": ev.From, "username": username},
			"content":   content,
			"createdAt": createdAt,
		}
		if parentUUID != nil {
			payload["parentId"] = parentUUID.String() // 👈 include if present
		}

		out := NewServerEvent("message.created", "server", roomIDStr, payload)

		h.broadcastToChannel(roomIDStr, out, "")
		if h.Presence != nil {
			_ = h.Presence.Touch(h.ctx, roomIDStr, ev.From)
		}
		return

	default:

		h.broadcast(ev)
	}
}

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

func (h *Hub) EmitSystem(ev Event) {
	select {
	case h.system <- ev:
	default:

	}
}
