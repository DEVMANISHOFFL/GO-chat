package chat

import (
	"errors"
	"strings"
	"time"

	"github.com/gocql/gocql"
)

type EditMessageResult struct {
	RoomID   string    `json:"roomId"`
	MsgID    string    `json:"msgId"`
	Content  string    `json:"content"`
	EditedAt time.Time `json:"editedAt"`
}

type DeleteMessageResult struct {
	RoomID        string    `json:"roomId"`
	MsgID         string    `json:"msgId"`
	DeletedAt     time.Time `json:"deletedAt"`
	DeletedBy     string    `json:"deletedBy"`
	DeletedReason *string   `json:"deletedReason,omitempty"`
}

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

// --- NEW: 15-minute edit window check ---
func (s *Service) EditMessage(roomID, msgID, userID gocql.UUID, newContent string) (*EditMessageResult, error) {
	newContent = strings.TrimSpace(newContent)
	if len(newContent) == 0 || len(newContent) > 4000 {
		return nil, errors.New("invalid content")
	}

	// load existing
	msg, err := s.Repo.GetMessage(roomID, msgID)
	if err != nil {
		return nil, err
	}
	// disallow editing deleted messages
	if msg.DeletedAt != nil {
		return nil, errors.New("message deleted")
	}
	// ownership + time window
	if msg.UserID != userID {
		return nil, errors.New("forbidden")
	}
	if time.Since(msg.CreatedAt) > 15*time.Minute {
		return nil, errors.New("edit window has expired")
	}

	editedAt := time.Now().UTC()
	if err := s.Repo.UpdateMessageContent(roomID, msgID, newContent, editedAt); err != nil {
		return nil, err
	}
	return &EditMessageResult{
		RoomID:   roomID.String(),
		MsgID:    msgID.String(),
		Content:  newContent,
		EditedAt: editedAt,
	}, nil
}

func (s *Service) DeleteMessage(roomID, msgID, userID gocql.UUID, reason string) (*DeleteMessageResult, error) {
	// load existing
	msg, err := s.Repo.GetMessage(roomID, msgID)
	if err != nil {
		return nil, err
	}
	// already deleted: idempotent OK
	if msg.DeletedAt != nil {
		return &DeleteMessageResult{
			RoomID:        roomID.String(),
			MsgID:         msgID.String(),
			DeletedAt:     *msg.DeletedAt,
			DeletedBy:     userID.String(),
			DeletedReason: msg.DeletedReason,
		}, nil
	}
	// allow author (and admins—if you add RBAC later)
	if msg.UserID != userID {
		return nil, errors.New("forbidden")
	}
	deletedAt := time.Now().UTC()
	if err := s.Repo.SoftDeleteMessage(roomID, msgID, userID, reason, deletedAt); err != nil {
		return nil, err
	}
	var reasonPtr *string
	if strings.TrimSpace(reason) != "" {
		r := strings.TrimSpace(reason)
		reasonPtr = &r
	}
	return &DeleteMessageResult{
		RoomID:        roomID.String(),
		MsgID:         msgID.String(),
		DeletedAt:     deletedAt,
		DeletedBy:     userID.String(),
		DeletedReason: reasonPtr,
	}, nil
}
