export type Member = {
    id: string;
    username: string;
    name?: string;
    avatarUrl?: string;
};

export type Message = {
    id: string;
    roomId: string;
    author: Pick<Member, 'id' | 'username' | 'avatarUrl'>;
    content: string;
    createdAt: string | number;
    type?: 'system' | 'user';
    replyToId?: string;
    editedAt?: string | number;
    deletedAt?: string | number;
    deletedBy?: { id: string; username?: string } | string;
    deletedReason?: string;
    parentId?: string;
};

export type Room = {
    id: string;
    name: string;
    topic?: string;
    unreadCount?: number
    type?: "channel" | "dm"
    uuid?: string;
};
