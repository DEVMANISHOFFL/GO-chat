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
    type?: 'system' | 'user';
    replyToId?: string;
    editedAt?: string | number;
    deletedAt?: string | number;
    deletedBy?: { id: string; username?: string } | string;
    deletedReason?: string;
};

export type Room = {
    id: string;            // your slug
    name: string;
    topic?: string;
    unreadCount?: number
    type?: "channel" | "dm"
    uuid?: string;
};
