package chat

import (
	"time"

	"github.com/gocql/gocql"
)

type Room struct {
	RoomID    gocql.UUID `json:"room_id"`
	Name      string     `json:"name"`
	CreatedBy gocql.UUID `json:"created_by"`
	CreatedAt time.Time  `json:"created_at"`
}

type CreateRoomRequest struct {
	Name string `json:"name"`
}

type CreateRoomResponse struct {
	RoomID string `json:"room_id"`
	Name   string `json:"name"`
}

type Message struct {
	RoomID    gocql.UUID `json:"room_id"`
	MsgID     gocql.UUID `json:"msg_id"` // timeuuid
	UserID    gocql.UUID `json:"user_id"`
	Content   string     `json:"content"`
	CreatedAt time.Time  `json:"created_at"`
}

type SendMessageRequest struct {
	Content string `json:"content"`
}

type SendMessageResponse struct {
	MsgID   string `json:"msg_id"`
	Content string `json:"content"`
}
