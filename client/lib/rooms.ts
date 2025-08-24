import type { Room } from './types';


export const MOCK_ROOMS: Room[] = [
    { id: 'general', name: 'general', type: 'channel', topic: 'Announcements and casual chat' },
    { id: 'random', name: 'random', type: 'channel', unreadCount: 3 },
    { id: 'team-ui', name: 'team-ui', type: 'channel' },
];


export const getRoomById = (id: string) => MOCK_ROOMS.find(r => r.id === id);