import type { Message } from '@/lib/types';


export function generateMockMessages(roomId: string, count = 250): Message[] {
    const now = Date.now();
    const msgs: Message[] = [];
    for (let i = 0; i < count; i++) {
        const ts = new Date(now - (count - i) * 60_000).toISOString();
        const mine = i % 3 === 0;
        msgs.push({
            id: `${roomId}-${i + 1}`,
            roomId,
            author: mine
                ? { id: 'me', name: 'You', avatarUrl: undefined }
                : { id: 'u2', name: i % 2 ? 'Avi' : 'Neha', avatarUrl: undefined },
            content:
                i % 5 === 0
                    ? 'Shipping the chat UI shell today. Hooking sockets next!'
                    : i % 2
                        ? 'Looks sleek. Let\'s add unread badges and typing indicators.'
                        : 'Roger that. Also, support uploads + emoji.',
            createdAt: ts,
            type: 'user',
        });
    }
    return msgs;
}