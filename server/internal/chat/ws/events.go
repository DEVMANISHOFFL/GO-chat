package ws

import "time"

// Event represents the canonical message envelope exchanged over WebSocket.
type Event struct {
	Type     string         `json:"type"`              // e.g. message.send, typing.start
	ID       string         `json:"id,omitempty"`      // client correlation id
	From     string         `json:"from,omitempty"`    // userID (server may set)
	To       string         `json:"to,omitempty"`      // userID or channelID
	Payload  map[string]any `json:"payload,omitempty"` // event-specific data
	ServerTs int64          `json:"server_ts,omitempty"`
}

// NewServerEvent prepares a server-originated event with server timestamp.
func NewServerEvent(typ, from, to string, payload map[string]interface{}) Event {
	return Event{
		Type:     typ,
		From:     from,
		To:       to,
		Payload:  payload,
		ServerTs: time.Now().Unix(),
	}
}
