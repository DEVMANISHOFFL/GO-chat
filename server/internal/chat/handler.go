package chat

//  {"type":"chat.message","from":"user123","to":"user123","payload":{"text":"hey"},"server_ts":1755979642}

import (
	"gochat/internal/ws"
	"net/http"
	"strings"
	"time"

	"encoding/json"
	"strconv"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"gochat/internal/auth"
	"gochat/internal/utils"

	"github.com/gocql/gocql"
	"github.com/gorilla/mux"
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
		
		roomID := r.URL.Query().Get("room_id")
		if roomID != "" {
			hub.Subscribe(client, roomID)
		}
		// Optionally send a welcome/presence event
		welcome := ws.NewServerEvent("conn.ack", "server", userID, map[string]interface{}{
			"connected_at": time.Now().Unix(),
			"client_id":    client.ID,
		})
		hub.SafeSend(client, welcome)
	}
}

type Handler struct {
	Svc *Service
}

func NewHandler(s *Service) *Handler { return &Handler{Svc: s} }

func (h *Handler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	uidStr := auth.GetUserID(r)
	if uidStr == "" {
		utils.JSONResponse(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	uid, err := gocql.ParseUUID(uidStr)
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid user id"})
		return
	}

	var req CreateRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid request payload"})
		return
	}

	resp, err := h.Svc.CreateRoom(uid, req)
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusCreated, resp)
}

func (h *Handler) ListRooms(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if q := r.URL.Query().Get("limit"); q != "" {
		if v, err := strconv.Atoi(q); err == nil {
			limit = v
		}
	}
	rooms, err := h.Svc.ListRooms(limit)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusOK, rooms)
}

// Register under /api/chat
func (h *Handler) Register(r *mux.Router, sess *gocql.Session) {
	// protected group already applied by caller
	r.HandleFunc("/rooms", h.CreateRoom).Methods("POST")
	r.HandleFunc("/rooms", h.ListRooms).Methods("GET")
	r.HandleFunc("/rooms/{room_id}/messages", h.SendMessage).Methods("POST")
	r.HandleFunc("/rooms/{room_id}/messages", h.ListMessages).Methods("GET")
}

func (h *Handler) SendMessage(w http.ResponseWriter, r *http.Request) {
	uidStr := auth.GetUserID(r)
	if uidStr == "" {
		utils.JSONResponse(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	uid, err := gocql.ParseUUID(uidStr)
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid user id"})
		return
	}

	vars := mux.Vars(r)
	roomIDStr := vars["room_id"]
	roomID, err := gocql.ParseUUID(roomIDStr)
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid room id"})
		return
	}

	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid request payload"})
		return
	}

	resp, err := h.Svc.SendMessage(roomID, uid, req)
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusCreated, resp)
}

func (h *Handler) ListMessages(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomIDStr := vars["room_id"]
	roomID, err := gocql.ParseUUID(roomIDStr)
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid room id"})
		return
	}

	limit := 50
	if q := r.URL.Query().Get("limit"); q != "" {
		if v, err := strconv.Atoi(q); err == nil {
			limit = v
		}
	}
	before := r.URL.Query().Get("before") // timeuuid string (optional)

	msgs, err := h.Svc.GetMessages(roomID, limit, before)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusOK, msgs)
}
