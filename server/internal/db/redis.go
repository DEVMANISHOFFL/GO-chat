package db

import (
	"context"
	"fmt"
	"log"

	"gochat/internal/utils"

	"github.com/redis/go-redis/v9"
)

var Ctx = context.Background()

func InitRedis() *redis.Client {
	host := utils.GetEnv("REDIS_HOST", "gochat_redis")
	port := utils.GetEnv("REDIS_PORT", "6379")

	addr := fmt.Sprintf("%s:%s", host, port)
	client := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	_, err := client.Ping(Ctx).Result()
	if err != nil {
		log.Fatalf("❌ Failed to connect to Redis: %v", err)
	}

	log.Println("✅ Connected to Redis at", addr)
	return client
}
