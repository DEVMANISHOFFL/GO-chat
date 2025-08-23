package db

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

var Ctx = context.Background()

// InitRedis initializes and returns a Redis client
func InitRedis(addr string) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr, // e.g., "localhost:6379"
	})
	_, err := rdb.Ping(Ctx).Result()
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

	log.Println("Connected to Redis")
	return rdb
}
