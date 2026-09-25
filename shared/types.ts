// Wire contract shared by the Fastify server and the Vue client.

export type PresenceStatus = 'online' | 'away' | 'offline'

export interface User {
  id: number
  name: string
  email: string
  avatarUrl: string | null
}

export interface Channel {
  id: number
  slug: string
  name: string
  topic: string
  isPrivate: boolean
  createdAt: string
  memberCount: number
  isMember: boolean
}

export interface Attachment {
  id: number
  messageId: number
  filename: string
  mime: string
  sizeBytes: number
  url: string
  thumbUrl: string | null
  status: 'pending' | 'ready' | 'failed'
  meta: { width?: number; height?: number; format?: string }
}

export interface Reaction {
  emoji: string
  count: number
  userIds: number[]
}

export interface Message {
  id: number
  channelId: number
  userId: number
  body: string
  replyToId: number | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  attachments: Attachment[]
  reactions: Reaction[]
  replyCount: number
  lastReplyAt: string | null
  replyUserIds: number[]
  clientId?: string
}

export interface MessagePage {
  messages: Message[]
  hasOlder: boolean
  hasNewer: boolean
}

export interface BootstrapPayload {
  me: User
  users: User[]
  channels: Channel[]
  unreads: Record<number, number>
  mentions: Record<number, number>
  lastReadIds: Record<number, number>
  presence: Record<number, PresenceStatus>
  instance: string
  serverTime: string
  searchEngine: 'meilisearch' | 'postgres'
}

export interface SearchHit {
  id: number
  channelId: number
  userId: number
  createdAt: string
  /** Snippet with \u0002 / \u0003 as highlight start/end markers — escape, then swap markers for <mark>. */
  snippet: string
}

export interface SearchResult {
  hits: SearchHit[]
  estimatedTotal: number
  tookMs: number
  engine: 'meilisearch' | 'postgres'
}

export interface UploadTicket {
  key: string
  putUrl: string
  headers: Record<string, string>
}

export interface OutgoingAttachment {
  key: string
  filename: string
  mime: string
  size: number
}

// ---- WebSocket frames -------------------------------------------------------

export type ClientFrame =
  | { type: 'hb'; status: 'online' | 'away' }
  | { type: 'typing'; channelId: number }
  | { type: 'watch'; channelId: number | null }
  | { type: 'ping' }

export type ServerEvent =
  | { type: 'hello'; instance: string; serverTime: string; userId: number }
  | { type: 'pong'; instance: string }
  | { type: 'message.created'; message: Message }
  | { type: 'message.updated'; message: Message }
  | { type: 'message.deleted'; channelId: number; id: number; replyToId: number | null }
  | { type: 'reactions.updated'; channelId: number; messageId: number; reactions: Reaction[] }
  | { type: 'thread.updated'; channelId: number; messageId: number; replyCount: number; lastReplyAt: string | null; replyUserIds: number[] }
  | { type: 'typing'; channelId: number; userId: number; active: boolean }
  | { type: 'presence'; userId: number; status: PresenceStatus }
  | { type: 'attachment.updated'; channelId: number; attachment: Attachment }
  | { type: 'channel.created'; channel: Channel }
  | { type: 'channel.updated'; channel: Channel }
  | { type: 'member.joined'; channelId: number; userId: number }
  | { type: 'member.left'; channelId: number; userId: number }
  | { type: 'user.created'; user: User }
  | { type: 'read'; channelId: number; messageId: number }

/** Envelope as it travels over Valkey pub/sub between app instances (and from the worker). */
export interface BusEnvelope {
  origin: string
  route: { channelId?: number; userIds?: number[]; all?: boolean }
  event: ServerEvent
}
