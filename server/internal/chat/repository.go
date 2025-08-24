package chat

import (
	"github.com/gocql/gocql"
)

type Repository struct {
	Session *gocql.Session
}

func NewRepository(sess *gocql.Session) *Repository {
	return &Repository{Session: sess}
}

func (r *Repository) InsertRoom(room *Room) error {
	q := `INSERT INTO rooms (room_id, name, created_by, created_at)
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

	var out []Room
	var rm Room
	for iter.Scan(&rm.RoomID, &rm.Name, &rm.CreatedBy, &rm.CreatedAt) {
		out = append(out, rm)
	}
	if err := iter.Close(); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Repository) InsertMessage(m *Message) error {
	q := `INSERT INTO room_messages (room_id, msg_id, user_id, content, created_at)
	      VALUES (?, ?, ?, ?, ?)`
	return r.Session.Query(q, m.RoomID, m.MsgID, m.UserID, m.Content, m.CreatedAt).Exec()
}

// ListMessages returns newest-first; if before != nil, returns messages with msg_id < before
func (r *Repository) ListMessages(roomID gocql.UUID, limit int, before *gocql.UUID) ([]Message, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var q string
	var iter *gocql.Iter

	if before != nil {
		q = `SELECT room_id, msg_id, user_id, content, created_at
		     FROM room_messages
		     WHERE room_id = ? AND msg_id < ?
		     ORDER BY msg_id DESC
		     LIMIT ?`
		iter = r.Session.Query(q, roomID, *before, limit).Iter()
	} else {
		q = `SELECT room_id, msg_id, user_id, content, created_at
		     FROM room_messages
		     WHERE room_id = ?
		     ORDER BY msg_id DESC
		     LIMIT ?`
		iter = r.Session.Query(q, roomID, limit).Iter()
	}

	msgs := make([]Message, 0, limit)
	var m Message
	for iter.Scan(&m.RoomID, &m.MsgID, &m.UserID, &m.Content, &m.CreatedAt) {
		msgs = append(msgs, m)
	}
	if err := iter.Close(); err != nil {
		return nil, err
	}
	return msgs, nil
}
