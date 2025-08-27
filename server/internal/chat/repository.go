package chat

import (
	"time"

	"github.com/gocql/gocql"
)

type Repository struct {
	Session *gocql.Session
}

func NewRepository(sess *gocql.Session) *Repository {
	return &Repository{Session: sess}
}

type Room struct {
	RoomID    gocql.UUID `json:"roomId"`
	Name      string     `json:"name"`
	CreatedBy gocql.UUID `json:"createdBy"`
	CreatedAt time.Time  `json:"createdAt"`

	Slug string `json:"slug,omitempty"`
}

type Message struct {
	RoomID        gocql.UUID  `json:"roomId"`
	MsgID         gocql.UUID  `json:"msgId"`
	UserID        gocql.UUID  `json:"userId"`
	Content       string      `json:"content"`
	CreatedAt     time.Time   `json:"createdAt"`
	EditedAt      *time.Time  `json:"editedAt,omitempty"`
	DeletedAt     *time.Time  `json:"deletedAt,omitempty"`
	DeletedBy     *gocql.UUID `json:"deletedBy,omitempty"`
	DeletedReason *string     `json:"deletedReason,omitempty"`
	ParentID      *gocql.UUID `json:"parentId,omitempty"` // 👈 add this (pointer = nullable)

}

func (r *Repository) InsertRoom(room *Room) error {
	const q = `INSERT INTO rooms (room_id, name, created_by, created_at)
	           VALUES (?, ?, ?, ?)`
	return r.Session.Query(q, room.RoomID, room.Name, room.CreatedBy, room.CreatedAt).Exec()
}

func (r *Repository) ListRooms(limit int) ([]Room, error) {
	if limit <= 0 {
		limit = 50
	}
	iter := r.Session.Query(
		`SELECT room_id, name, created_by, created_at FROM rooms LIMIT ?`, limit,
	).Iter()

	out := make([]Room, 0, limit)
	var rm Room
	for iter.Scan(&rm.RoomID, &rm.Name, &rm.CreatedBy, &rm.CreatedAt) {
		out = append(out, rm)
	}
	if err := iter.Close(); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Repository) UpsertRoomSlug(roomID gocql.UUID, slug string) error {
	const q = `UPDATE rooms SET slug = ? WHERE room_id = ?`
	return r.Session.Query(q, slug, roomID).Exec()
}

func (r *Repository) GetRoomIDBySlug(slug string) (gocql.UUID, error) {
	var id gocql.UUID
	const q = `SELECT room_id FROM rooms WHERE slug = ? LIMIT 1`
	if err := r.Session.Query(q, slug).Scan(&id); err != nil {
		return gocql.UUID{}, err
	}
	return id, nil
}

func (r *Repository) InsertMessage(m *Message) error {
	const q = `INSERT INTO room_messages
           (room_id, msg_id, user_id, content, created_at, parent_id)
           VALUES (?, ?, ?, ?, ?, ?)`
	return r.Session.Query(q,
		m.RoomID, m.MsgID, m.UserID, m.Content, m.CreatedAt, m.ParentID,
	).Exec()

}

func (r *Repository) ListMessages(roomID gocql.UUID, limit int, before *gocql.UUID) ([]Message, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var iter *gocql.Iter
	const baseQ = `SELECT room_id, msg_id, user_id, content, created_at,
                      edited_at, deleted_at, deleted_by, deleted_reason, parent_id
               FROM room_messages`

	if before != nil {
		q := baseQ + `
            WHERE room_id = ? AND msg_id < ?
            ORDER BY msg_id DESC
            LIMIT ?`
		iter = r.Session.Query(q, roomID, *before, limit).Iter()
	} else {
		q := baseQ + `
            WHERE room_id = ?
            ORDER BY msg_id DESC
            LIMIT ?`
		iter = r.Session.Query(q, roomID, limit).Iter()
	}

	msgs := make([]Message, 0, limit)
	var m Message
	for iter.Scan(&m.RoomID, &m.MsgID, &m.UserID, &m.Content, &m.CreatedAt,
		&m.EditedAt, &m.DeletedAt, &m.DeletedBy, &m.DeletedReason, &m.ParentID) {
		msgs = append(msgs, m)
	}
	if err := iter.Close(); err != nil {
		return nil, err
	}
	return msgs, nil
}

func (r *Repository) UpdateMessageContent(roomID, msgID gocql.UUID, newContent string, editedAt time.Time) error {
	const q = `UPDATE room_messages
	           SET content = ?, edited_at = ?
	           WHERE room_id = ? AND msg_id = ?`
	return r.Session.Query(q, newContent, editedAt, roomID, msgID).Exec()
}

func (r *Repository) SoftDeleteMessage(roomID, msgID, deletedBy gocql.UUID, reason string, deletedAt time.Time) error {
	const q = `UPDATE room_messages
	           SET deleted_at = ?, deleted_by = ?, deleted_reason = ?
	           WHERE room_id = ? AND msg_id = ?`
	return r.Session.Query(q, deletedAt, deletedBy, reason, roomID, msgID).Exec()
}

func (r *Repository) GetMessage(roomID, msgID gocql.UUID) (*Message, error) {
	const q = `SELECT room_id, msg_id, user_id, content, created_at, edited_at, deleted_at, deleted_by, deleted_reason, parent_id
           FROM room_messages
           WHERE room_id = ? AND msg_id = ?
           LIMIT 1`
		   
	var m Message

	err := r.Session.Query(q, roomID, msgID).Scan(
		&m.RoomID, &m.MsgID, &m.UserID, &m.Content, &m.CreatedAt,
		&m.EditedAt, &m.DeletedAt, &m.DeletedBy, &m.DeletedReason, &m.ParentID,
	)
	if err != nil {
		return nil, err
	}
	return &m, nil
}
