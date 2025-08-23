package main

import (
	"log"
	"net/http"

	"gochat/internal/auth"
	"gochat/internal/db"

	"github.com/gorilla/mux"
)

func main() {
	// Initialize databases
	scyllaSession := db.InitScylla([]string{"127.0.0.1"}, "chat_app")
	defer scyllaSession.Close()

	redisClient := db.InitRedis("localhost:6379")
	defer redisClient.Close()

	// Initialize auth
	authRepo := auth.NewRepository(scyllaSession) // PostgreSQL repo
	authService := auth.NewService(authRepo)
	authHandler := auth.NewHandler(authService)

	// Router
	r := mux.NewRouter()
	authHandler.RegisterRouter(r)

	log.Println("Server running on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}
