// export type ReactionSummary = {
//   emoji: string
//   count: number
//   me_reacted: boolean
// }

// export type ReactionEvent = {
//   type: 'reaction.add' | 'reaction.remove'
//   to: string 
//   payload: {
//     message_id: string
//     emoji: string
//     count: number
//     user: { id: string; username: string }
//   }
// }

// export type Message = {
//   room_id: string
//   msg_id: string
//   user_id: string
//   content: string
//   created_at: number
//   reactions?: ReactionSummary[]
// }