import { Room } from "./types";

export const MOCK_ROOMS: Room[] = [
  {
    id: 'general',
    name: 'general',
    type: 'channel',
    topic: 'Announcements and casual chat',
    uuid: '2d3457ac-80c7-11f0-b194-00155ddecefe', 
  },
];


export const getRoomById = (id: string) => MOCK_ROOMS.find(r => r.id === id);