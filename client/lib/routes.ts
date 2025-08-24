export const roomPath = (id: string) => `/rooms/${encodeURIComponent(id)}`;
export const dmPath = (userId: string) => `/dm/${encodeURIComponent(userId)}`;
export const threadPath = (roomId: string, messageId: string) => `/rooms/${encodeURIComponent(roomId)}/thread/${encodeURIComponent(messageId)}`;