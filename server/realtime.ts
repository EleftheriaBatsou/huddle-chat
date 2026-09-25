// Ephemeral realtime state — all of it lives in Valkey, none of it in Postgres.
import { redis, publish } from './bus.js'
import { config } from './config.js'
import { q } from './db.js'
import type { PresenceStatus } from '../shared/types.js'

const k = {
  status: (uid: number) => `presence:user:${uid}`, // "online" | "away", EX = presence TTL
  online: 'presence:online', // zset uid -> last heartbeat (ms); drives the ageing-out sweep
  channel: (cid: number) => `presence:channel:${cid}`, // zset uid -> last heartbeat, per channel
  typing: (cid: number, uid: number) => `typing:${cid}:${uid}`,
  unread: (uid: number) => `unread:${uid}`, // hash cid -> count
  mentions: (uid: number) => `mentions:${uid}`, // hash cid -> count
  members: (cid: number) => `members:${cid}`, // set of uids (cache of channel_members)
  rate: (uid: number, win: number) => `rl:send:${uid}:${win}`,
}

// ---- presence ---------------------------------------------------------------

/** Heartbeat from a live socket. Refreshes TTLs; announces only on an actual status change. */
export async function heartbeat(uid: number, status: 'online' | 'away', channelIds: Iterable<number>) {
  const now = Date.now()
  const m = redis.multi()
  m.set(k.status(uid), status, 'EX', config.presenceTtlSec, 'GET')
  m.zadd(k.online, now, String(uid))
  for (const cid of channelIds) m.zadd(k.channel(cid), now, String(uid))
  const res = await m.exec()
  const previous = res?.[0]?.[1] as string | null
  if (previous !== status) await publish({ all: true }, { type: 'presence', userId: uid, status })
}

/** Last socket for this user on this instance closed: let presence lapse soon unless another socket (any instance) heartbeats. */
export async function socketGone(uid: number) {
  const graceMs = 6000
  await redis.zadd(k.online, 'XX', Date.now() - config.presenceTtlSec * 1000 + graceMs, String(uid))
}

/** Periodic sweep (every instance runs it; ZREM makes each expiry announced exactly once). */
export async function sweepPresence() {
  const cutoff = Date.now() - config.presenceTtlSec * 1000
  const stale = await redis.zrangebyscore(k.online, '-inf', cutoff)
  for (const uid of stale) {
    if ((await redis.zrem(k.online, uid)) === 1) {
      await redis.del(k.status(Number(uid)))
      await publish({ all: true }, { type: 'presence', userId: Number(uid), status: 'offline' })
    }
  }
}

export async function presenceMap(): Promise<Record<number, PresenceStatus>> {
  const cutoff = Date.now() - config.presenceTtlSec * 1000
  const uids = await redis.zrangebyscore(k.online, cutoff, '+inf')
  if (!uids.length) return {}
  const statuses = await redis.mget(uids.map((u) => k.status(Number(u))))
  const out: Record<number, PresenceStatus> = {}
  uids.forEach((u, i) => (out[Number(u)] = (statuses[i] as PresenceStatus) ?? 'online'))
  return out
}

/** Users with a live socket in this channel right now (per-channel presence). */
export async function channelPresence(cid: number): Promise<number[]> {
  const cutoff = Date.now() - config.presenceTtlSec * 1000
  await redis.zremrangebyscore(k.channel(cid), '-inf', String(cutoff))
  return (await redis.zrange(k.channel(cid), '0', '-1')).map(Number)
}

// ---- typing -----------------------------------------------------------------

export async function setTyping(cid: number, uid: number, active: boolean) {
  if (active) await redis.set(k.typing(cid, uid), '1', 'EX', config.typingTtlSec)
  else await redis.del(k.typing(cid, uid))
  await publish({ channelId: cid }, { type: 'typing', channelId: cid, userId: uid, active })
}

export async function typingUsers(cid: number): Promise<number[]> {
  const out: number[] = []
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `typing:${cid}:*`, 'COUNT', 200)
    cursor = next
    for (const key of keys) out.push(Number(key.split(':')[2]))
  } while (cursor !== '0')
  return out
}

// ---- membership cache + unread counters -------------------------------------

export async function channelMembers(cid: number): Promise<number[]> {
  const cached = await redis.smembers(k.members(cid))
  if (cached.length) return cached.map(Number)
  const rows = await q<{ user_id: number }>('SELECT user_id FROM channel_members WHERE channel_id = $1', [cid])
  const ids = rows.map((r) => r.user_id)
  if (ids.length) await redis.multi().sadd(k.members(cid), ...ids.map(String)).expire(k.members(cid), 3600).exec()
  return ids
}

export async function memberAdded(cid: number, uid: number) {
  if (await redis.exists(k.members(cid))) await redis.sadd(k.members(cid), String(uid))
}

export async function memberRemoved(cid: number, uid: number) {
  await redis.multi().srem(k.members(cid), String(uid)).hdel(k.unread(uid), String(cid)).hdel(k.mentions(uid), String(cid)).exec()
}

export async function bumpUnreads(cid: number, senderId: number, mentioned: number[], countForAll = true) {
  const members = await channelMembers(cid)
  const m = redis.multi()
  if (countForAll) for (const uid of members) if (uid !== senderId) m.hincrby(k.unread(uid), String(cid), 1)
  for (const uid of mentioned) if (uid !== senderId && members.includes(uid)) m.hincrby(k.mentions(uid), String(cid), 1)
  await m.exec()
}

export async function clearUnread(uid: number, cid: number) {
  await redis.multi().hdel(k.unread(uid), String(cid)).hdel(k.mentions(uid), String(cid)).exec()
}

export async function unreadCounts(uid: number) {
  const [unread, mentions] = await Promise.all([redis.hgetall(k.unread(uid)), redis.hgetall(k.mentions(uid))])
  const toNum = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([c, n]) => [Number(c), Number(n)]))
  return { unreads: toNum(unread), mentions: toNum(mentions) }
}

/** Rebuild unread counters from Postgres last_read_message_id (used after seeding). */
export async function rebuildUnreads() {
  const rows = await q<{ user_id: number; channel_id: number; n: number }>(`
    SELECT cm.user_id, cm.channel_id, count(m.id)::int AS n
    FROM channel_members cm
    JOIN messages m ON m.channel_id = cm.channel_id AND m.reply_to_id IS NULL AND m.deleted_at IS NULL
      AND m.id > COALESCE(cm.last_read_message_id, 0) AND m.user_id <> cm.user_id
    GROUP BY 1, 2`)
  const m = redis.multi()
  for (const r of rows) m.hset(k.unread(r.user_id), String(r.channel_id), r.n)
  await m.exec()
}

// ---- rate limiting ----------------------------------------------------------

/** Fixed-window limiter on message sends. Returns seconds to wait, or 0 if allowed. */
export async function checkSendRate(uid: number): Promise<number> {
  const { windowSec, max } = config.rateLimit
  const win = Math.floor(Date.now() / 1000 / windowSec)
  const key = k.rate(uid, win)
  const [[, count]] = (await redis.multi().incr(key).expire(key, windowSec + 1).exec()) as [[null, number]]
  return count > max ? windowSec - (Math.floor(Date.now() / 1000) % windowSec) : 0
}
