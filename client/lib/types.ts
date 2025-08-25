// src/lib/types.ts
export type Member = {
    id: string;            // user UUID
    username: string;      // handle to display
    name?: string;         // optional full name (unused in UI now)
    avatarUrl?: string;
};

export type Message = {
    id: string;
    roomId: string;
    author: Pick<Member, 'id' | 'username' | 'avatarUrl'>;
    content: string;
    createdAt: string | number; // tolerate ISO or ms
    editedAt?: string;
    type?: 'system' | 'user';
    replyToId?: string;
};

export type Room = {
    id: string;            // your slug
    name: string;
    topic?: string;
    unreadCount?: number
    type?: "channel" | "dm"
    uuid?: string;
};
