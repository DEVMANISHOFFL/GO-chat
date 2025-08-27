export type WSStatus = 'connecting' | 'connected' | 'offline';

export type ServerEvent =
  | { type: 'hello'; userId?: string; data?: any }
  | { type: 'conn.ack'; data: { connected_at?: number; client_id?: string } }
  | {
    type: 'message.created';
    data: {
      id: string;
      tempId?: string;
      roomId: string;
      author: { id: string; name: string; avatarUrl?: string };
      content: string;
      createdAt: string;
      
    };
  }
  | {
    type: 'message.updated';
    data: { id: string; roomId: string; content: string; editedAt: string };
  }
  | { type: 'message.deleted'; data: { id: string; roomId: string } }
  | { type: 'typing.start'; data: { roomId: string; userId: string; name?: string } }
  | { type: 'typing.stop'; data: { roomId: string; userId: string } }
  | { type: 'error'; data?: { reason?: string } };

export type ClientEvent =
  | { type: 'ping' }
  | {
    "type": "message.send",
    "payload": { "tempId": "...", "roomId": "...", "content": "...", "parentId": "<optional>" }
  }
  | { type: 'typing.start'; to: string; payload: { roomId: string } }
  | { type: 'typing.stop'; to: string; payload: { roomId: string } }
  | { type: 'room.join'; payload: { roomId: string } }
  | { type: 'room.leave'; payload: { roomId: string } };
