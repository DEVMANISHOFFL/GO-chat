package main

import (
	"fmt"
	"log"
	"net/http"

	"gochat/internal/routes"
)

func main() {
	r := routes.SetupRouter()
	fmt.Println("Server running	on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
