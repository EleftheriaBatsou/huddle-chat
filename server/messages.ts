import { q, one } from './db.js'
import { fileUrl } from './storage.js'
import type { Attachment, Message, MessagePage, Reaction } from '../shared/types.js'

export interface MessageRow {
  id: number
  channel_id: number
  user_id: number
  body: string
  reply_to_id: number | null
  edited_at: Date | null
  deleted_at: Date | null
  created_at: Date
}

const SELECT = `
  SELECT m.*, t.reply_count, t.last_reply_at, t.reply_user_ids
  FROM messages m
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS reply_count, max(r.created_at) AS last_reply_at,
           (array_agg(DISTINCT r.user_id))[1:4] AS reply_user_ids
    FROM messages r WHERE r.reply_to_id = m.id AND r.deleted_at IS NULL
  ) t ON m.reply_to_id IS NULL`

export function attachmentFromRow(a: any): Attachment {
  return {
    id: a.id,
    messageId: a.message_id,
    filename: a.filename,
    mime: a.mime,
    sizeBytes: a.size_bytes,
    url: fileUrl(a.object_key),
    thumbUrl: a.thumb_key ? fileUrl(a.thumb_key) : null,
    status: a.status,
    meta: a.meta ?? {},
  }
}

export async function reactionsFor(ids: number[]): Promise<Map<number, Reaction[]>> {
  const out = new Map<number, Reaction[]>()
  if (!ids.length) return out
  const rows = await q(
    `SELECT message_id, emoji, array_agg(user_id ORDER BY created_at) AS user_ids, min(created_at) AS first
     FROM reactions WHERE message_id = ANY($1) GROUP BY 1, 2 ORDER BY first`,
    [ids],
  )
  for (const r of rows) {
    const list = out.get(r.message_id) ?? []
    list.push({ emoji: r.emoji, count: r.user_ids.length, userIds: r.user_ids.map(Number) })
    out.set(r.message_id, list)
  }
  return out
}

export async function hydrate(rows: (MessageRow & Record<string, any>)[]): Promise<Message[]> {
  const ids = rows.map((r) => r.id)
  const [atts, reacts] = await Promise.all([
    ids.length ? q('SELECT * FROM attachments WHERE message_id = ANY($1) ORDER BY id', [ids]) : Promise.resolve([]),
    reactionsFor(ids),
  ])
  const attBy = new Map<number, Attachment[]>()
  for (const a of atts) {
    const list = attBy.get(a.message_id) ?? []
    list.push(attachmentFromRow(a))
    attBy.set(a.message_id, list)
  }
  return rows.map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    userId: r.user_id,
    body: r.deleted_at ? '' : r.body,
    replyToId: r.reply_to_id,
    editedAt: r.edited_at?.toISOString() ?? null,
    deletedAt: r.deleted_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    attachments: r.deleted_at ? [] : (attBy.get(r.id) ?? []),
    reactions: r.deleted_at ? [] : (reacts.get(r.id) ?? []),
    replyCount: r.reply_count ?? 0,
    lastReplyAt: r.last_reply_at ? new Date(r.last_reply_at).toISOString() : null,
    replyUserIds: (r.reply_user_ids ?? []).map(Number),
  }))
}

export async function getMessage(id: number): Promise<Message | undefined> {
  const row = await one(`${SELECT} WHERE m.id = $1`, [id])
  return row ? (await hydrate([row]))[0] : undefined
}

// Cursor = "<created_at ISO>~<id>" — a keyset over the (channel_id, created_at, id) index.
export const encodeCursor = (m: { createdAt: string; id: number }) => `${m.createdAt}~${m.id}`
function decodeCursor(c: string): [string, number] {
  const i = c.lastIndexOf('~')
  return [c.slice(0, i), Number(c.slice(i + 1))]
}

const TOP = 'm.reply_to_id IS NULL AND (m.deleted_at IS NULL OR EXISTS (SELECT 1 FROM messages r WHERE r.reply_to_id = m.id AND r.deleted_at IS NULL))'

export async function pageBefore(channelId: number, before: string | null, limit: number): Promise<MessagePage> {
  const params: unknown[] = [channelId, limit + 1]
  let cond = ''
  if (before) {
    const [ts, id] = decodeCursor(before)
    params.push(ts, id)
    cond = 'AND (m.created_at, m.id) < ($3::timestamptz, $4::bigint)'
  }
  const rows = await q(`${SELECT} WHERE m.channel_id = $1 AND ${TOP} ${cond} ORDER BY m.created_at DESC, m.id DESC LIMIT $2`, params)
  const hasOlder = rows.length > limit
  const page = rows.slice(0, limit).reverse()
  return { messages: await hydrate(page), hasOlder, hasNewer: false }
}

export async function pageAfter(channelId: number, after: string, limit: number): Promise<MessagePage> {
  const [ts, id] = decodeCursor(after)
  const rows = await q(
    `${SELECT} WHERE m.channel_id = $1 AND ${TOP} AND (m.created_at, m.id) > ($3::timestamptz, $4::bigint)
     ORDER BY m.created_at ASC, m.id ASC LIMIT $2`,
    [channelId, limit + 1, ts, id],
  )
  const hasNewer = rows.length > limit
  return { messages: await hydrate(rows.slice(0, limit)), hasOlder: true, hasNewer }
}

/** A window of history centred on one message — powers jump-to-message from search. */
export async function around(messageId: number, half = 25) {
  const target = await one<MessageRow>('SELECT * FROM messages WHERE id = $1', [messageId])
  if (!target) return null
  // A thread reply jumps to its root in the channel, and the client opens the thread.
  const anchor = target.reply_to_id ? await one<MessageRow>('SELECT * FROM messages WHERE id = $1', [target.reply_to_id]) : target
  if (!anchor) return null
  const cursor = encodeCursor({ createdAt: anchor.created_at.toISOString(), id: anchor.id })
  const [older, newer, self] = await Promise.all([
    pageBefore(anchor.channel_id, cursor, half),
    pageAfter(anchor.channel_id, cursor, half),
    getMessage(anchor.id),
  ])
  return {
    channelId: anchor.channel_id,
    anchorId: anchor.id,
    threadRootId: target.reply_to_id,
    page: {
      messages: [...older.messages, ...(self ? [self] : []), ...newer.messages],
      hasOlder: older.hasOlder,
      hasNewer: newer.hasNewer,
    } satisfies MessagePage,
  }
}

export async function thread(rootId: number) {
  const root = await getMessage(rootId)
  if (!root) return null
  const rows = await q(`${SELECT} WHERE m.reply_to_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at, m.id`, [rootId])
  return { root, replies: await hydrate(rows) }
}

/** Everything a reconnecting client missed: new messages after its last seen id, plus edits/deletes since its last sync. */
export async function missedSince(channelIds: number[], sinceId: number, sinceTs: string) {
  if (!channelIds.length) return []
  const rows = await q(
    `${SELECT} WHERE m.channel_id = ANY($1) AND (m.id > $2 OR GREATEST(m.edited_at, m.deleted_at) > $3::timestamptz)
     ORDER BY m.id LIMIT 500`,
    [channelIds, sinceId, sinceTs],
  )
  return hydrate(rows)
}

export async function threadSummary(rootId: number) {
  return one<{ reply_count: number; last_reply_at: Date | null; reply_user_ids: number[] | null }>(
    `SELECT count(*)::int AS reply_count, max(created_at) AS last_reply_at, (array_agg(DISTINCT user_id))[1:4] AS reply_user_ids
     FROM messages WHERE reply_to_id = $1 AND deleted_at IS NULL`,
    [rootId],
  )
}
