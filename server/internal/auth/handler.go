package auth

import (
	"encoding/json"
	"net/http"

	"gochat/internal/utils"

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

func (h *Handler) RegisterRouter(r *mux.Router) {
	r.HandleFunc("/signup", h.Signup).Methods("POST")
	r.HandleFunc("/login", h.Login).Methods("POST")
}
