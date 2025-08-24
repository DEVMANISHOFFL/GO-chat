package ws

import (
	"encoding/json"
	"time"
)

// Event is the canonical message envelope for WebSocket traffic.
type Event struct {
	Type     string                 `json:"type"`                // e.g. "message.send", "typing.start"
	ID       string                 `json:"id,omitempty"`        // optional correlation id
	From     string                 `json:"from,omitempty"`      // userID (server may set)
	To       string                 `json:"to,omitempty"`        // userID/roomID
	Payload  map[string]interface{} `json:"payload,omitempty"`   // event-specific data
	ServerTs int64                  `json:"server_ts,omitempty"` // unix seconds (server clock)
}

// NewServerEvent builds a server-originated envelope with server timestamp.
func NewServerEvent(typ, from, to string, payload map[string]interface{}) Event {
	return Event{
		Type:     typ,
		From:     from,
		To:       to,
		Payload:  payload,
		ServerTs: time.Now().Unix(),
	}
}

// marshal is a small helper to JSON-encode an Event.
func (e Event) marshal() []byte {
	b, _ := json.Marshal(e)
	return b
}

// decodePayload decodes Event.Payload into v via re-marshal (simple & safe).
func decodePayload[T any](e Event, v *T) error {
	b, err := json.Marshal(e.Payload)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
