package chat

//  {"type":"chat.message","from":"user123","to":"user123","payload":{"text":"hey"},"server_ts":1755979642}

import (
	"gochat/internal/ws"
	"net/http"
	"os"
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
	CheckOrigin: func(r *http.Request) bool {
		o := r.Header.Get("Origin")
		if os.Getenv("ENV") == "dev" || os.Getenv("ALLOW_ALL_ORIGINS") == "1" {
			return true
		}
		return o == "http://localhost:3000" || o == "http://127.0.0.1:3000"
	},
}

// WSHandler upgrades, authenticates, registers client, subscribes to room, and acks.
func WSHandler(hub *ws.Hub, validator AuthValidator, logger *zap.Logger, sendQueueSize int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if logger != nil {
			logger.Info("ws.upgrade.attempt",
				zap.String("origin", r.Header.Get("Origin")),
				zap.String("remote", r.RemoteAddr),
				zap.String("room_id", r.URL.Query().Get("room_id")),
				zap.Bool("has_auth_header", strings.HasPrefix(strings.ToLower(r.Header.Get("Authorization")), "bearer ")),
				zap.Bool("has_token_query", r.URL.Query().Get("token") != ""),
			)
		}

		// 1) Extract token
		var token string
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			token = auth[7:]
		} else {
			token = r.URL.Query().Get("token")
		}
		if token == "" {
			http.Error(w, "missing token", http.StatusUnauthorized)
			return
		}

		// 2) Validate via injected validator
		userID, err := validator(token)
		if err != nil || userID == "" {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		// 3) Upgrade
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			if logger != nil {
				logger.Warn("ws.upgrade.failed", zap.Error(err))
			}
			return
		}
		if logger != nil {
			logger.Info("ws.upgrade.ok", zap.String("user_id", userID))
		}

		// 4) Register client
		client := ws.NewClient(conn, userID, hub, sendQueueSize)
		hub.RegisterClient(client)
		go client.WritePump()
		go client.ReadPump()

		// 5) Optional room auto-subscribe
		if roomID := r.URL.Query().Get("room_id"); roomID != "" {
			hub.Subscribe(client, roomID)
		}

		// 6) Ack
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
