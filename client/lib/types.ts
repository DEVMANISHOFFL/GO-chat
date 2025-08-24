export type Room = {
id: string;
uuid:string;
name: string;
type?: 'channel' | 'dm';
unreadCount?: number;
topic?: string;
};


export type Member = {
id: string;
name: string;
avatarUrl?: string;
presence?: 'online' | 'idle' | 'dnd' | 'offline';
};


export type Message = {
id: string;
roomId: string;
author: Pick<Member, 'id' | 'name' | 'avatarUrl'>;
content: string;
createdAt: string; // ISO
editedAt?: string;
type?: 'system' | 'user';
replyToId?: string;
};