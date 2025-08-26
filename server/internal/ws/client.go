package ws

import (
	"bytes"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1 << 20
)

type Client struct {
	ID            string
	UserID        string
	conn          *websocket.Conn
	send          chan []byte
	subscriptions map[string]struct{}
	hub           *Hub
}

func NewClient(conn *websocket.Conn, userID string, hub *Hub, sendQueueSize int) *Client {
	return &Client{
		ID:            uuid.NewString(),
		UserID:        userID,
		conn:          conn,
		send:          make(chan []byte, sendQueueSize),
		subscriptions: make(map[string]struct{}),
		hub:           hub,
	}
}

func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {

			}
			break
		}

		message = bytes.TrimSpace(bytes.ReplaceAll(message, []byte{'\n'}, []byte{' '}))

		var ev Event
		if err := json.Unmarshal(message, &ev); err != nil {

			errEv := NewServerEvent("error", "server", c.UserID, map[string]interface{}{
				"reason": "invalid_event",
			})
			c.hub.SafeSend(c, errEv)
			continue
		}

		if ev.From == "" {
			ev.From = c.UserID
		}

		c.hub.inbound <- ev
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				_ = w.Close()
				return
			}
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
