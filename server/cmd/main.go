package main

import (
	"fmt"
	"gochat/internal/auth"
	"gochat/internal/chat"    // 👈 for WSHandler
	"gochat/internal/chat/ws" // 👈 for NewHub
	"gochat/internal/db"
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

func main() {
	// Initialize databases
	scyllaSession := db.InitScylla([]string{"127.0.0.1"}, "chat_app")
	defer scyllaSession.Close()

	redisClient := db.InitRedis("localhost:6379")
	defer redisClient.Close()

	// Initialize auth
	authRepo := auth.NewRepository(scyllaSession)
	authService := auth.NewService(authRepo)
	authHandler := auth.NewHandler(authService)

	// Router
	r := mux.NewRouter()
	authHandler.RegisterRouter(r)

	// WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Dummy token validator
	validator := func(token string) (string, error) {
		if token == "secrettoken" {
			return "user123", nil
		}
		return "", fmt.Errorf("invalid token")
	}

	// 👇 Register the /ws endpoint on mux.Router, not http.HandleFunc
	r.HandleFunc("/ws", chat.WSHandler(hub, validator, nil, 256))

	log.Println("Server running on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}
