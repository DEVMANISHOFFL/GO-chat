package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"gochat/internal/config"
	"gochat/internal/database"
	"gochat/internal/routes"

	"github.com/gorilla/mux"
)

func main() {
	config.LoadEnv()

	scylla := database.InitScylla()
	defer scylla.Close()

	redisClient := database.InitRedis()
	defer redisClient.Close()

	r := mux.NewRouter()
	routes.RegisterRoutes(r, scylla, redisClient)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("🚀 Server running at http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
