package chat

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gocql/gocql"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"gochat/internal/auth"
	"gochat/internal/utils"
	"gochat/internal/ws"
)

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

// ---- Handler with Scylla session ----
type Handler struct {
	Svc    *Service
	Scylla *gocql.Session
	Hub    *ws.Hub
}

func NewHandler(s *Service, scylla *gocql.Session, hub *ws.Hub) *Handler {
	return &Handler{Svc: s, Scylla: scylla, Hub: hub}
}

// Register under /api/chat (subrouter passed by caller)
func (h *Handler) Register(r *mux.Router) {
	r.HandleFunc("/rooms", h.CreateRoom).Methods("POST")
	r.HandleFunc("/rooms", h.ListRooms).Methods("GET")
	r.HandleFunc("/rooms/{room_id}/messages", h.SendMessage).Methods("POST")
	r.HandleFunc("/rooms/{room_id}/messages", h.ListMessages).Methods("GET")

	r.HandleFunc("/rooms/{room_id}/messages/{msg_id}", h.EditMessage).Methods("PATCH")
	r.HandleFunc("/rooms/{room_id}/messages/{msg_id}", h.DeleteMessage).Methods("DELETE")
}

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
		var token string
		if authz := r.Header.Get("Authorization"); strings.HasPrefix(strings.ToLower(authz), "bearer ") {
			token = authz[7:]
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
			if logger != nil {
				logger.Warn("ws.upgrade.failed", zap.Error(err))
			}
			return
		}
		if logger != nil {
			logger.Info("ws.upgrade.ok", zap.String("user_id", userID))
		}

		client := ws.NewClient(conn, userID, hub, sendQueueSize)
		hub.RegisterClient(client)
		go client.WritePump()
		go client.ReadPump()

		if roomID := r.URL.Query().Get("room_id"); roomID != "" {
			hub.Subscribe(client, roomID)
		}

		welcome := ws.NewServerEvent("conn.ack", "server", userID, map[string]interface{}{
			"connected_at": time.Now().Unix(),
			"client_id":    client.ID,
		})
		hub.SafeSend(client, welcome)
	}
}

func NewHandlerWithoutScylla(s *Service) *Handler { // if other packages still call it
	return &Handler{Svc: s, Scylla: nil}
}

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

	// Accept UUID or slug. Try UUID first.
	roomID, err := gocql.ParseUUID(roomIDStr)
	if err != nil {
		// resolve slug -> uuid via rooms table
		if h.Scylla == nil {
			utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid room id"})
			return
		}
		var resolved gocql.UUID
		const q = `SELECT id FROM rooms WHERE slug = ? LIMIT 1`
		if err2 := h.Scylla.Query(q, roomIDStr).WithContext(r.Context()).Scan(&resolved); err2 != nil {
			utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid room id"})
			return
		}
		roomID = resolved
	}

	limit := 50
	if q := r.URL.Query().Get("limit"); q != "" {
		if v, err := strconv.Atoi(q); err == nil {
			limit = v
		}
	}
	before := r.URL.Query().Get("before") // optional

	msgs, err := h.Svc.GetMessages(roomID, limit, before)
	if err != nil {
		utils.JSONResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusOK, msgs)
}

func (h *Handler) EditMessage(w http.ResponseWriter, r *http.Request) {
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
	roomID, err := gocql.ParseUUID(vars["room_id"])
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid room id"})
		return
	}
	msgID, err := gocql.ParseUUID(vars["msg_id"])
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid message id"})
		return
	}

	var req EditMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}

	res, err := h.Svc.EditMessage(roomID, msgID, uid, req.Content)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(err.Error(), "expired") {
			status = http.StatusConflict
		}
		utils.JSONResponse(w, status, map[string]string{"error": err.Error()})
		return
	}

	// WS broadcast: message.updated
	if h.Hub != nil {
		ev := ws.NewServerEvent("message.updated", "server", res.RoomID, map[string]any{
			"id":       res.MsgID,
			"roomId":   res.RoomID,
			"content":  res.Content,
			"editedAt": res.EditedAt.Format(time.RFC3339Nano),
		})
		h.Hub.EmitSystem(ev)
	}

	utils.JSONResponse(w, http.StatusOK, res)
}

func (h *Handler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
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
	roomID, err := gocql.ParseUUID(vars["room_id"])
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid room id"})
		return
	}
	msgID, err := gocql.ParseUUID(vars["msg_id"])
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid message id"})
		return
	}

	// reason can come from body or query (?reason=)
	var req DeleteMessageRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Reason == "" {
		req.Reason = r.URL.Query().Get("reason")
	}

	res, err := h.Svc.DeleteMessage(roomID, msgID, uid, req.Reason)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		utils.JSONResponse(w, status, map[string]string{"error": err.Error()})
		return
	}

	// WS broadcast: message.deleted (tombstone)
	if h.Hub != nil {
		payload := map[string]any{
			"id":        res.MsgID,
			"roomId":    res.RoomID,
			"deletedAt": res.DeletedAt.Format(time.RFC3339Nano),
			"deletedBy": res.DeletedBy,
		}
		if res.DeletedReason != nil {
			payload["deletedReason"] = *res.DeletedReason
		}
		ev := ws.NewServerEvent("message.deleted", "server", res.RoomID, payload)
		h.Hub.EmitSystem(ev)
	}

	utils.JSONResponse(w, http.StatusOK, res)
}
