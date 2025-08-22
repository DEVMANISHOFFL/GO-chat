package controller

import (
	"encoding/json"
	"net/http"

	"gochat/internal/models"
	"gochat/internal/services"

	"github.com/gocql/gocql"
	"github.com/redis/go-redis/v9"
)

type ChatController struct {
	Scylla *gocql.Session
	Redis  *redis.Client
}

func (c *ChatController) SendMessage(w http.ResponseWriter, r *http.Request) {
	var msg models.Message
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	services.PublishMessage(c.Redis, msg)
	services.SaveMessage(c.Scylla, msg)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}
