package routes

import (
	"gochat/internal/controller"

	"github.com/gocql/gocql"
	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"
)

func RegisterRoutes(r *mux.Router, scylla *gocql.Session, redis *redis.Client) {
	chatCtrl := &controller.ChatController{
		Scylla: scylla,
		Redis:  redis,
	}

	api := r.PathPrefix("/api/v1").Subrouter()
	api.HandleFunc("/send", chatCtrl.SendMessage).Methods("POST")
}
