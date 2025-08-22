package services

import (
	"log"

	"gochat/internal/database"
	"gochat/internal/models"

	"github.com/gocql/gocql"
	"github.com/redis/go-redis/v9"
)

func PublishMessage(client *redis.Client, msg models.Message) {
	err := client.Publish(database.Ctx, "chat_channel", msg.Content).Err()
	if err != nil {
		log.Printf("Failed to publish message: %v", err)
	}
}

func SaveMessage(session *gocql.Session, msg models.Message) {
	if err := session.Query(`
		INSERT INTO messages (id, user_id, content, timestamp)
		VALUES (?, ?, ?, ?)`,
		msg.ID, msg.UserID, msg.Content, msg.Timestamp).Exec(); err != nil {
		log.Printf("Failed to save message: %v", err)
	}
}
