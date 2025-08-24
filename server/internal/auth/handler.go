package auth

import (
	"encoding/json"
	"net/http"

	"gochat/internal/utils"

	"github.com/gocql/gocql"
	"github.com/gorilla/mux"
)

type Handler struct {
	Service *Service
}

func NewHandler(s *Service) *Handler {
	return &Handler{Service: s}
}

// Signup endpoint: POST /signup
func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid request payload"})
		return
	}

	resp, err := h.Service.Signup(req)
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	utils.JSONResponse(w, http.StatusCreated, resp)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{
			"error": "invalid request payload",
		})
		return
	}
	resp, err := h.Service.Login(req)
	if err != nil {
		utils.JSONResponse(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusOK, resp)
}

func (h *Handler) Profile(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	utils.JSONResponse(w, http.StatusOK, map[string]string{
		"message": "Welcome to your profile",
		"user_id": userID,
	})
}

func (h *Handler) RegisterRouter(r *mux.Router) {

	r.HandleFunc("/signup", h.Signup).Methods("POST")
	r.HandleFunc("/login", h.Login).Methods("POST")

	protected := r.PathPrefix("/api").Subrouter()
	protected.Use(AuthMiddleware)

	protected.HandleFunc("/profile", h.Profile).Methods("GET")
	protected.HandleFunc("/me", h.Me).Methods("GET")
	protected.HandleFunc("/logout", h.Logout).Methods("POST")
	protected.HandleFunc("/refresh", h.Refresh).Methods("POST")
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r) // from middleware context
	if userID == "" {
		utils.JSONResponse(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid request payload"})
		return
	}
	resp, err := h.Service.Refresh(userID, req)
	if err != nil {
		utils.JSONResponse(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusOK, resp)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.JSONResponse(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var req LogoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid request payload"})
		return
	}
	if err := h.Service.Logout(userID, req); err != nil {
		if err == gocql.ErrNotFound {
			utils.JSONResponse(w, http.StatusNotFound, map[string]string{"error": "refresh token not found"})
			return
		}
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusOK, map[string]string{"status": "logged out"})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		utils.JSONResponse(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	resp, err := h.Service.Me(userID)
	if err != nil {
		utils.JSONResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	utils.JSONResponse(w, http.StatusOK, resp)
}
