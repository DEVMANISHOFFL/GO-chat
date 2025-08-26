package ws

import (
	"encoding/json"
	"time"
)

type Event struct {
	Type     string                 `json:"type"`
	ID       string                 `json:"id,omitempty"`
	From     string                 `json:"from,omitempty"`
	To       string                 `json:"to,omitempty"`
	Payload  map[string]interface{} `json:"payload,omitempty"`
	ServerTs int64                  `json:"server_ts,omitempty"`
}

func NewServerEvent(typ, from, to string, payload map[string]interface{}) Event {
	return Event{
		Type:     typ,
		From:     from,
		To:       to,
		Payload:  payload,
		ServerTs: time.Now().Unix(),
	}
}

func (e Event) marshal() []byte {
	b, _ := json.Marshal(e)
	return b
}

func decodePayload[T any](e Event, v *T) error {
	b, err := json.Marshal(e.Payload)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
