package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"gochat/internal/chat"
	"gochat/internal/presence"

	"gochat/internal/auth"
	"gochat/internal/db"
	"gochat/internal/utils"
	"gochat/internal/ws"

	"github.com/gocql/gocql"
	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

func main() {
	// --- Config (env with sensible defaults) ---
	httpAddr := getEnv("HTTP_ADDR", ":8080")
	scyllaHost := getEnv("SCYLLA_HOST", "127.0.0.1")
	scyllaKeyspace := getEnv("SCYLLA_KEYSPACE", "chat_app")
	redisAddr := getEnv("REDIS_ADDR", "127.0.0.1:6379")

	// --- DB: Scylla + Redis ---
	scyllaSession := db.InitScylla([]string{scyllaHost}, scyllaKeyspace)
	defer scyllaSession.Close()

	redisClient := db.InitRedis(redisAddr)
	defer redisClient.Close()

	chatRepo := chat.NewRepository(scyllaSession)
	chatSvc := chat.NewService(chatRepo)
	persist := func(roomID, userID gocql.UUID, text string, createdAt time.Time) (gocql.UUID, error) {
		id := gocql.TimeUUID()
		err := chatRepo.InsertMessage(&chat.Message{
			RoomID:    roomID,
			MsgID:     id,
			UserID:    userID,
			Content:   text,
			CreatedAt: createdAt,
		})
		return id, err
	}

	lookup := func(ctx context.Context, userID gocql.UUID) (string, error) {
		var username string
		// adjust to your actual table/columns
		err := scyllaSession.
			Query(`SELECT username FROM users WHERE id = ? LIMIT 1`, userID).
			Consistency(gocql.One).
			Scan(&username)
		if err == gocql.ErrNotFound {
			return "", nil
		}
		return username, err
	}

	pres := presence.New(redisClient, 45*time.Second)

	hub := ws.NewHub(persist, lookup)
	hub.Presence = pres
	go hub.Run()
	chatH := chat.NewHandler(chatSvc, scyllaSession, hub)

	logger, _ := zap.NewDevelopment() // or zap.NewProduction()
	defer logger.Sync()
	// --- DI: auth repo → service → handler ---
	authRepo := auth.NewRepository(scyllaSession)
	authService := auth.NewService(authRepo)
	authHandler := auth.NewHandler(authService)

	// --- Router ---
	r := mux.NewRouter()

	api := r.PathPrefix("/api").Subrouter()
	api.Use(auth.AuthMiddleware)

	chatH.Register(api.PathPrefix("/chat").Subrouter())

	api.HandleFunc("/chat/rooms/{room_id}/presence", func(w http.ResponseWriter, r *http.Request) {
		roomID := mux.Vars(r)["room_id"]
		users, err := pres.List(r.Context(), roomID, 1000)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		utils.WriteJSON(w, http.StatusOK, map[string]any{
			"room_id": roomID,
			"online":  users,
			"count":   len(users),
		})
	}).Methods("GET")

	// Health endpoints
	r.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}).Methods("GET")

	r.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		if err := pingScylla(scyllaSession); err != nil {
			http.Error(w, "scylla not ready", http.StatusServiceUnavailable)
			return
		}
		if err := pingRedis(redisClient); err != nil {
			http.Error(w, "redis not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready"))
	}).Methods("GET")

	// Auth routes (/signup, /login, /api/profile)
	authHandler.RegisterRouter(r)

	// WebSocket hub + JWT validator

	jwtValidator := func(token string) (string, error) {
		claims, err := utils.ValidateJWT(token)
		if err != nil {
			return "", err
		}
		uid, _ := claims["user_id"].(string)
		if uid == "" {
			return "", fmt.Errorf("user_id missing in token")
		}
		return uid, nil
	}

	// /ws endpoint (uses real JWT now)
	r.HandleFunc("/ws", chat.WSHandler(hub, jwtValidator, logger, 256))

	handler := withCORS(r)
	// --- HTTP server + graceful shutdown ---
	srv := &http.Server{
		Addr:         httpAddr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("server listening on %s", httpAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	// Wait for Ctrl+C
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("server shutdown: %v", err)
	}
	log.Println("server stopped")
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func pingScylla(sess *gocql.Session) error {
	var t time.Time
	return sess.Query(`SELECT now() FROM system.local`).Scan(&t)
}

func pingRedis(rdb *redis.Client) error {
	_, err := rdb.Ping(db.Ctx).Result()
	return err
}

// cors.go (or in main.go)

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "http://localhost:3000" || origin == "http://127.0.0.1:3000" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Max-Age", "3600")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
