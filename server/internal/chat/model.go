package chat

type CreateRoomRequest struct {
	Name string `json:"name"`
}

type CreateRoomResponse struct {
	RoomID string `json:"room_id"`
	Name   string `json:"name"`
}

type SendMessageRequest struct {
	Content string `json:"content"`
}

type SendMessageResponse struct {
	MsgID   string `json:"msg_id"`
	Content string `json:"content"`
}

type EditMessageRequest struct {
	Content string `json:"content"`
}

type DeleteMessageRequest struct {
	Reason string `json:"reason,omitempty"`
}
