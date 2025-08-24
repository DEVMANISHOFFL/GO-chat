package chat

import (
	"errors"
	"strings"
	"time"

	"github.com/gocql/gocql"
)

type Service struct {
	Repo *Repository
}

func NewService(repo *Repository) *Service { return &Service{Repo: repo} }

func (s *Service) CreateRoom(userID gocql.UUID, req CreateRoomRequest) (*CreateRoomResponse, error) {
	name := strings.TrimSpace(req.Name)
	if len(name) < 3 {
		return nil, errors.New("room name must be at least 3 chars")
	}
	room := &Room{
		RoomID:    gocql.TimeUUID(),
		Name:      name,
		CreatedBy: userID,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.Repo.InsertRoom(room); err != nil {
		return nil, err
	}
	return &CreateRoomResponse{RoomID: room.RoomID.String(), Name: room.Name}, nil
}

func (s *Service) ListRooms(limit int) ([]Room, error) {
	return s.Repo.ListRooms(limit)
}

func (s *Service) SendMessage(roomID, userID gocql.UUID, req SendMessageRequest) (*SendMessageResponse, error) {
	content := strings.TrimSpace(req.Content)
	if len(content) == 0 || len(content) > 4000 {
		return nil, errors.New("invalid content")
	}

	msg := &Message{
		RoomID:    roomID,
		MsgID:     gocql.TimeUUID(),
		UserID:    userID,
		Content:   content,
		CreatedAt: time.Now().UTC(),
	}
	if err := s.Repo.InsertMessage(msg); err != nil {
		return nil, err
	}
	return &SendMessageResponse{MsgID: msg.MsgID.String(), Content: msg.Content}, nil
}

func (s *Service) GetMessages(roomID gocql.UUID, limit int, beforeStr string) ([]Message, error) {
	var before *gocql.UUID
	if beforeStr != "" {
		if b, err := gocql.ParseUUID(beforeStr); err == nil {
			before = &b
		}
	}
	return s.Repo.ListMessages(roomID, limit, before)
}
