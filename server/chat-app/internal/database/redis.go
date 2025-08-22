package database

import (
	"context"
	"log"
	"os"

	"github.com/redis/go-redis/v9"
)

var Ctx = context.Background()

func InitRedis() *redis.Client {
	client := redis.NewClient(&redis.Options{
		Addr: os.Getenv("REDIS_ADDR"),
	})

	_, err := client.Ping(Ctx).Result()
	if err != nil {
		log.Fatalf("Redis connection failed: %v", err)
	}

	log.Println("Connected to Redis")
	return client
}
