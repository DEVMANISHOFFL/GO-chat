// // src/hooks/useDM.ts
// import { useEffect, useRef, useState } from 'react';
// import { fetchMessages } from '../lib/api';
// import { openChatSocket, ServerEvent } from '@/lib/ws';
// import type { Message } from '../../lib/types';

// export function useDM(roomId: string) {
//   const [msgs, setMsgs] = useState<Message[]>([]);
//   const [typing, setTyping] = useState<boolean>(false);
//   const wsRef = useRef<WebSocket | null>(null);

//   useEffect(() => {
//     let alive = true;

//     async function boot() {
//       // 1) history
//       try {
//         const history: Message[] = await fetchMessages(roomId, 50);
//         if (!alive) return;
//         setMsgs(history);
//       } catch (e) {
//         console.error('fetchMessages failed:', e);
//       }

//       // 2) websocket
//       function connect() {
//         const ws = openChatSocket(roomId);
//         wsRef.current = ws;

//         ws.onopen = () => {
//           // optional explicit subscribe (server already auto-subs via query)
//           ws.send(JSON.stringify({ type: 'channel.subscribe', to: roomId }));
//         };

//         ws.onmessage = (e) => {
//           try {
//             const ev: ServerEvent = JSON.parse(e.data);
//             switch (ev.type) {
//               case 'conn.ack':
//               case 'channel.subscribed':
//                 return;
//               case 'message.created': {
//                 const m = ev.payload as Message;
//                 setMsgs((list) => [...list, m]);
//                 return;
//               }
//               case 'message.updated': {
//                 const m = ev.payload as Message;
//                 setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
//                 return;
//               }
//               case 'message.deleted': {
//                 const m = ev.payload as Message;
//                 setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, deletedAt: m.deletedAt ?? new Date().toISOString() } : x)));
//                 return;
//               }
//               case 'typing.start':
//                 setTyping(true);
//                 return;
//               case 'typing.stop':
//                 setTyping(false);
//                 return;
//               case 'error':
//                 console.warn('WS error event:', ev.payload);
//                 return;
//               default:
//                 // ignore unknown event
//                 return;
//             }
//           } catch (err) {
//             console.error('WS parse error', err, e.data);
//           }
//         };

//         ws.onclose = () => {
//           if (!alive) return;
//           setTimeout(connect, 1000); // naive reconnect
//         };
//       }

//       connect();
//     }

//     boot();
//     return () => {
//       alive = false;
//       wsRef.current?.close();
//     };
//   }, [roomId]);

//   // Send helpers (these must match server’s expected event shape)
//   const send = (text: string) => {
//     wsRef.current?.send(JSON.stringify({
//       type: 'message.send',
//       to: roomId,
//       payload: { text },
//     }));
//   };

//   const typingStart = () => {
//     wsRef.current?.send(JSON.stringify({ type: 'typing.start', to: roomId }));
//   };
//   const typingStop = () => {
//     wsRef.current?.send(JSON.stringify({ type: 'typing.stop', to: roomId }));
//   };

//   return { msgs, typing, send, typingStart, typingStop };
// }
