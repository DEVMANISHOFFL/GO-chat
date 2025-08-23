package chat

//  {"type":"chat.message","from":"user123","to":"user123","payload":{"text":"hey"},"server_ts":1755979642}

import (
	"gochat/internal/chat/ws"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

// AuthValidator validates token and returns userID on success.
type AuthValidator func(token string) (userID string, err error)

var upgrader = websocket.Upgrader{
	// Tighten CheckOrigin in production to allowed origins list
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WSHandler returns an http.HandlerFunc that upgrades the connection,
// authenticates the user, and registers the client with the hub.
func WSHandler(hub *ws.Hub, validator AuthValidator, logger *zap.Logger, sendQueueSize int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract token: try Authorization header first, then query param.
		var token string
		auth := r.Header.Get("Authorization")
		if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			token = auth[7:]
		} else {
			token = r.URL.Query().Get("token")
		}
		if token == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}

		userID, err := validator(token)
		if err != nil || userID == "" {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			logger.Warn("ws.upgrade.failed", zap.Error(err))
			return
		}

		client := ws.NewClient(conn, userID, hub, sendQueueSize)
		// register and start pumps
		hub.RegisterClient(client)
		go client.WritePump()
		go client.ReadPump()

		// Optionally send a welcome/presence event
		welcome := ws.NewServerEvent("conn.ack", "server", userID, map[string]interface{}{
			"connected_at": time.Now().Unix(),
			"client_id":    client.ID,
		})
		hub.SafeSend(client, welcome)
	}
}
