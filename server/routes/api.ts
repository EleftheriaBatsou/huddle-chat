import type { FastifyInstance } from 'fastify'
import { pool, q, one } from '../db.js'
import { config } from '../config.js'
import { issueToken, requireUser } from '../auth.js'
import { publish, redis, busStats } from '../bus.js'
import { canView, isMember, visibleChannelIds } from '../access.js'
import * as rt from '../realtime.js'
import { enqueue, queueHealthy } from '../queue.js'
import { engine, indexMessage, removeMessage, searchMessages, indexedCount } from '../search.js'
import { newObjectKey, presignGet, presignPut, objectSize, fileUrl } from '../storage.js'
import { around, getMessage, missedSince, pageAfter, pageBefore, reactionsFor, thread, threadSummary } from '../messages.js'
import { localConnections, stats } from '../hub.js'
import type { BootstrapPayload, Channel, OutgoingAttachment, User } from '../../shared/types.js'

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })

export const userFromRow = (u: any): User => ({
  id: u.id,
  name: u.name,
  email: u.email,
  avatarUrl: u.avatar_key ? fileUrl(u.avatar_key) : null,
})

const CHANNEL_SELECT = `
  SELECT c.*, (SELECT count(*)::int FROM channel_members WHERE channel_id = c.id) AS member_count,
         EXISTS (SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = $1) AS is_member
  FROM channels c`

const channelFromRow = (c: any): Channel => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  topic: c.topic,
  isPrivate: c.is_private,
  createdAt: c.created_at.toISOString(),
  memberCount: c.member_count,
  isMember: c.is_member,
})

async function loadChannel(uid: number, cid: number) {
  const row = await one(`${CHANNEL_SELECT} WHERE c.id = $2`, [uid, cid])
  return row ? channelFromRow(row) : undefined
}

async function mentionedUserIds(body: string): Promise<number[]> {
  const handles = [...body.matchAll(/(?:^|[^\w])@([\p{L}\w]+)/gu)].map((m) => m[1].toLowerCase())
  if (!handles.length) return []
  const rows = await q<{ id: number }>(`SELECT id FROM users WHERE lower(split_part(name, ' ', 1)) = ANY($1)`, [handles])
  return rows.map((r) => r.id)
}

async function assertMember(uid: number, cid: number) {
  if (!(await isMember(uid, cid))) throw httpError(403, 'Join the channel first')
}

async function userName(uid: number) {
  return (await one<{ name: string }>('SELECT name FROM users WHERE id = $1', [uid]))?.name ?? ''
}

export async function joinChannel(uid: number, cid: number, role = 'member') {
  const res = await pool.query(
    `INSERT INTO channel_members (channel_id, user_id, role, last_read_message_id)
     VALUES ($1, $2, $3, (SELECT max(id) FROM messages WHERE channel_id = $1)) ON CONFLICT DO NOTHING`,
    [cid, uid, role],
  )
  if (res.rowCount) {
    await rt.memberAdded(cid, uid)
    await publish({ channelId: cid }, { type: 'member.joined', channelId: cid, userId: uid })
  }
}

export default async function api(app: FastifyInstance) {
  // ---- public -----------------------------------------------------------------
  app.get('/api/health', async () => {
    const [db, cache, search] = await Promise.all([
      pool.query('SELECT 1').then(() => true, () => false),
      redis.ping().then(() => true, () => false),
      indexedCount().then((n) => ({ ok: true, documents: n }), () => ({ ok: false, documents: 0 })),
    ])
    return {
      ok: db && cache,
      instance: config.instance,
      db,
      cache,
      queue: queueHealthy(),
      search: { engine, ...search },
      connections: localConnections(),
      bus: { ...(await busStats().catch(() => ({ subscribers: -1 }))), ...stats },
    }
  })

  app.get('/api/auth/users', async () => {
    const rows = await q('SELECT * FROM users ORDER BY id LIMIT 30')
    return rows.map(userFromRow)
  })

  app.post<{ Body: { name?: string; email?: string } }>('/api/auth/login', async (req) => {
    const name = (req.body?.name ?? '').trim().slice(0, 60)
    let email = (req.body?.email ?? '').trim().toLowerCase().slice(0, 120)
    if (!name && !email) throw httpError(400, 'Name required')
    let user = email
      ? await one('SELECT * FROM users WHERE email = $1', [email])
      : await one('SELECT * FROM users WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [name])
    if (!user) {
      email ||= `${name.toLowerCase().replace(/[^\w]+/g, '.')}.${Date.now().toString(36)}@chat.local`
      user = await one('INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *', [name || email.split('@')[0], email])
      await publish({ all: true }, { type: 'user.created', user: userFromRow(user) })
      const defaults = await q<{ id: number }>(`SELECT id FROM channels WHERE NOT is_private AND slug IN ('general', 'random')`)
      for (const c of defaults) await joinChannel(user.id, c.id)
    }
    return { token: issueToken(user.id), user: userFromRow(user) }
  })

  // Attachment bytes live in private object storage; hand out a short-lived signed URL.
  app.get<{ Params: { '*': string } }>('/files/*', async (req, reply) => {
    const key = req.params['*']
    if (!/^(attachments|thumbs|avatars)\//.test(key)) throw httpError(404, 'Not found')
    reply.header('Cache-Control', 'private, max-age=2400')
    return reply.redirect(await presignGet(key), 302)
  })

  // ---- authenticated ------------------------------------------------------------
  app.register(async (auth) => {
    auth.addHook('onRequest', requireUser)

    auth.get('/api/bootstrap', async (req): Promise<BootstrapPayload> => {
      const uid = req.userId
      const me = await one('SELECT * FROM users WHERE id = $1', [uid])
      if (!me) throw httpError(401, 'Unknown user')
      const [users, channels, counts, reads, presence] = await Promise.all([
        q('SELECT * FROM users ORDER BY name'),
        q(`${CHANNEL_SELECT} WHERE NOT c.is_private OR EXISTS (SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = $1) ORDER BY c.name`, [uid]),
        rt.unreadCounts(uid),
        q('SELECT channel_id, last_read_message_id FROM channel_members WHERE user_id = $1', [uid]),
        rt.presenceMap(),
      ])
      return {
        me: userFromRow(me),
        users: users.map(userFromRow),
        channels: channels.map(channelFromRow),
        ...counts,
        lastReadIds: Object.fromEntries(reads.map((r) => [r.channel_id, r.last_read_message_id ?? 0])),
        presence,
        instance: config.instance,
        serverTime: new Date().toISOString(),
        searchEngine: engine,
      }
    })

    // ---- channels ----
    auth.post<{ Body: { name: string; topic?: string; isPrivate?: boolean } }>('/api/channels', async (req) => {
      const name = (req.body?.name ?? '').trim().toLowerCase().replace(/[^\p{L}\d]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40)
      if (!name) throw httpError(400, 'Channel name required')
      const exists = await one('SELECT 1 FROM channels WHERE slug = $1', [name])
      if (exists) throw httpError(409, `#${name} already exists`)
      const row = await one(
        'INSERT INTO channels (slug, name, topic, is_private) VALUES ($1, $1, $2, $3) RETURNING id',
        [name, (req.body.topic ?? '').slice(0, 200), !!req.body.isPrivate],
      )
      await pool.query(`INSERT INTO channel_members (channel_id, user_id, role) VALUES ($1, $2, 'owner')`, [row.id, req.userId])
      await rt.memberAdded(row.id, req.userId)
      const channel = (await loadChannel(req.userId, row.id))!
      if (channel.isPrivate) {
        await publish({ userIds: [req.userId] }, { type: 'channel.created', channel })
      } else {
        await publish({ all: true }, { type: 'channel.created', channel: { ...channel, isMember: false } })
      }
      await publish({ channelId: row.id }, { type: 'member.joined', channelId: row.id, userId: req.userId })
      return channel
    })

    auth.post<{ Params: { id: string } }>('/api/channels/:id/join', async (req) => {
      const cid = Number(req.params.id)
      if (!(await canView(req.userId, cid))) throw httpError(404, 'No such channel')
      await joinChannel(req.userId, cid)
      return loadChannel(req.userId, cid)
    })

    auth.post<{ Params: { id: string } }>('/api/channels/:id/leave', async (req) => {
      const cid = Number(req.params.id)
      await pool.query('DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2', [cid, req.userId])
      await rt.memberRemoved(cid, req.userId)
      await publish({ channelId: cid }, { type: 'member.left', channelId: cid, userId: req.userId })
      return { ok: true }
    })

    auth.post<{ Params: { id: string }; Body: { userId: number } }>('/api/channels/:id/members', async (req) => {
      const cid = Number(req.params.id)
      await assertMember(req.userId, cid)
      await joinChannel(Number(req.body.userId), cid)
      const channel = await loadChannel(Number(req.body.userId), cid)
      await publish({ userIds: [Number(req.body.userId)] }, { type: 'channel.created', channel: channel! })
      return { ok: true }
    })

    auth.get<{ Params: { id: string } }>('/api/channels/:id/presence', async (req) => {
      const cid = Number(req.params.id)
      if (!(await canView(req.userId, cid))) throw httpError(404, 'No such channel')
      const [members, active, typing] = await Promise.all([rt.channelMembers(cid), rt.channelPresence(cid), rt.typingUsers(cid)])
      return { members, active, typing: typing.filter((u) => u !== req.userId) }
    })

    auth.post<{ Params: { id: string }; Body: { messageId: number } }>('/api/channels/:id/read', async (req) => {
      const cid = Number(req.params.id)
      const mid = Number(req.body?.messageId) || 0
      await pool.query(
        `UPDATE channel_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), $3)
         WHERE channel_id = $1 AND user_id = $2`,
        [cid, req.userId, mid],
      )
      await rt.clearUnread(req.userId, cid)
      await publish({ userIds: [req.userId] }, { type: 'read', channelId: cid, messageId: mid })
      return { ok: true }
    })

    // ---- history ----
    auth.get<{ Params: { id: string }; Querystring: { before?: string; after?: string; limit?: string } }>(
      '/api/channels/:id/messages',
      async (req) => {
        const cid = Number(req.params.id)
        if (!(await canView(req.userId, cid))) throw httpError(404, 'No such channel')
        const limit = Math.min(Number(req.query.limit) || 50, 100)
        return req.query.after ? pageAfter(cid, req.query.after, limit) : pageBefore(cid, req.query.before ?? null, limit)
      },
    )

    auth.get<{ Params: { id: string } }>('/api/messages/:id/context', async (req) => {
      const ctx = await around(Number(req.params.id))
      if (!ctx || !(await canView(req.userId, ctx.channelId))) throw httpError(404, 'Message not found')
      return ctx
    })

    auth.get<{ Params: { id: string } }>('/api/messages/:id/thread', async (req) => {
      const t = await thread(Number(req.params.id))
      if (!t || !(await canView(req.userId, t.root.channelId))) throw httpError(404, 'Thread not found')
      return t
    })

    auth.get<{ Querystring: { sinceId?: string; sinceTs?: string; watch?: string } }>('/api/sync', async (req) => {
      const rows = await q<{ channel_id: number }>('SELECT channel_id FROM channel_members WHERE user_id = $1', [req.userId])
      const ids = rows.map((r) => r.channel_id)
      const watch = Number(req.query.watch)
      if (watch && !ids.includes(watch) && (await canView(req.userId, watch))) ids.push(watch)
      const sinceTs = req.query.sinceTs ?? new Date(Date.now() - 60_000).toISOString()
      const serverTime = new Date().toISOString()
      const [messages, counts] = await Promise.all([
        missedSince(ids, Number(req.query.sinceId) || 0, sinceTs),
        rt.unreadCounts(req.userId),
      ])
      return { messages, serverTime, ...counts, presence: await rt.presenceMap() }
    })

    // ---- sending ----
    auth.post<{
      Params: { id: string }
      Body: { body?: string; clientId?: string; replyToId?: number | null; attachments?: OutgoingAttachment[] }
    }>('/api/channels/:id/messages', async (req, reply) => {
      const cid = Number(req.params.id)
      const uid = req.userId
      const wait = await rt.checkSendRate(uid)
      if (wait) {
        reply.header('Retry-After', String(wait))
        throw httpError(429, `Slow down — you can send again in ${wait}s`)
      }
      await assertMember(uid, cid)
      const body = (req.body?.body ?? '').trim().slice(0, 4000)
      const atts = (req.body?.attachments ?? []).slice(0, 10)
      if (!body && !atts.length) throw httpError(400, 'Empty message')
      const replyToId = req.body?.replyToId ? Number(req.body.replyToId) : null
      if (replyToId) {
        const parent = await one('SELECT channel_id, reply_to_id FROM messages WHERE id = $1', [replyToId])
        if (!parent || parent.channel_id !== cid || parent.reply_to_id) throw httpError(400, 'Invalid thread')
      }
      for (const a of atts) {
        if (!a.key?.startsWith('attachments/')) throw httpError(400, 'Invalid attachment')
        const size = await objectSize(a.key)
        if (size == null) throw httpError(400, `Upload of ${a.filename} did not finish`)
        a.size = size
      }

      const client = await pool.connect()
      let messageId: number
      const attachmentIds: number[] = []
      try {
        await client.query('BEGIN')
        const { rows } = await client.query(
          'INSERT INTO messages (channel_id, user_id, body, reply_to_id) VALUES ($1, $2, $3, $4) RETURNING id',
          [cid, uid, body, replyToId],
        )
        messageId = rows[0].id
        for (const a of atts) {
          const r = await client.query(
            `INSERT INTO attachments (message_id, object_key, filename, mime, size_bytes, status)
             VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
            [messageId, a.key, a.filename.slice(0, 200), a.mime || 'application/octet-stream', a.size],
          )
          attachmentIds.push(r.rows[0].id)
        }
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      const message = (await getMessage(messageId))!
      message.clientId = req.body?.clientId
      await publish({ channelId: cid }, { type: 'message.created', message })

      // Everything below is side-effects that must never delay the sender.
      void (async () => {
        const mentioned = await mentionedUserIds(body)
        if (replyToId) {
          const t = await threadSummary(replyToId)
          await publish({ channelId: cid }, {
            type: 'thread.updated', channelId: cid, messageId: replyToId,
            replyCount: t?.reply_count ?? 0, lastReplyAt: t?.last_reply_at?.toISOString() ?? null, replyUserIds: t?.reply_user_ids ?? [],
          })
        }
        // Thread replies only count toward unreads when they mention you.
        await rt.bumpUnreads(cid, uid, mentioned, !replyToId)
        await rt.setTyping(cid, uid, false)
        if (body) indexMessage({ id: messageId, channelId: cid, userId: uid, userName: await userName(uid), body, createdAt: Math.floor(Date.parse(message.createdAt) / 1000) })
        for (const id of attachmentIds) await enqueue('jobs.attachment', { attachmentId: id })
      })().catch((err) => app.log.error(err, 'post-send side effects failed'))

      return message
    })

    auth.patch<{ Params: { id: string }; Body: { body: string } }>('/api/messages/:id', async (req) => {
      const id = Number(req.params.id)
      const body = (req.body?.body ?? '').trim().slice(0, 4000)
      if (!body) throw httpError(400, 'Empty message')
      const row = await one(
        'UPDATE messages SET body = $1, edited_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING channel_id, created_at',
        [body, id, req.userId],
      )
      if (!row) throw httpError(403, 'You can only edit your own messages')
      const message = (await getMessage(id))!
      await publish({ channelId: row.channel_id }, { type: 'message.updated', message })
      indexMessage({ id, channelId: row.channel_id, userId: req.userId, userName: await userName(req.userId), body, createdAt: Math.floor(row.created_at.getTime() / 1000) })
      return message
    })

    auth.delete<{ Params: { id: string } }>('/api/messages/:id', async (req) => {
      const id = Number(req.params.id)
      const row = await one(
        'UPDATE messages SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING channel_id, reply_to_id',
        [id, req.userId],
      )
      if (!row) throw httpError(403, 'You can only delete your own messages')
      await publish({ channelId: row.channel_id }, { type: 'message.deleted', channelId: row.channel_id, id, replyToId: row.reply_to_id })
      if (row.reply_to_id) {
        const t = await threadSummary(row.reply_to_id)
        await publish({ channelId: row.channel_id }, {
          type: 'thread.updated', channelId: row.channel_id, messageId: row.reply_to_id,
          replyCount: t?.reply_count ?? 0, lastReplyAt: t?.last_reply_at?.toISOString() ?? null, replyUserIds: t?.reply_user_ids ?? [],
        })
      }
      removeMessage(id)
      return { ok: true }
    })

    auth.post<{ Params: { id: string }; Body: { emoji: string } }>('/api/messages/:id/reactions', async (req) => {
      const id = Number(req.params.id)
      const emoji = String(req.body?.emoji ?? '').slice(0, 16)
      if (!emoji) throw httpError(400, 'Emoji required')
      const msg = await one<{ channel_id: number }>('SELECT channel_id FROM messages WHERE id = $1 AND deleted_at IS NULL', [id])
      if (!msg) throw httpError(404, 'Message not found')
      await assertMember(req.userId, msg.channel_id)
      const del = await pool.query('DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [id, req.userId, emoji])
      if (!del.rowCount) await pool.query('INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)', [id, req.userId, emoji])
      const reactions = (await reactionsFor([id])).get(id) ?? []
      await publish({ channelId: msg.channel_id }, { type: 'reactions.updated', channelId: msg.channel_id, messageId: id, reactions })
      return reactions
    })

    // ---- uploads & search ----
    auth.post<{ Body: { filename: string; mime: string; size: number } }>('/api/uploads', async (req) => {
      const { filename, mime, size } = req.body ?? ({} as any)
      if (!filename || !size) throw httpError(400, 'filename and size required')
      if (size > config.maxUploadBytes) throw httpError(413, 'Files are limited to 25 MB')
      const key = newObjectKey(filename)
      const contentType = mime || 'application/octet-stream'
      return { key, putUrl: await presignPut(key, contentType), headers: { 'Content-Type': contentType } }
    })

    auth.get<{ Querystring: { q?: string; channelId?: string } }>('/api/search', async (req) => {
      const query = (req.query.q ?? '').trim().slice(0, 200)
      let ids = await visibleChannelIds(req.userId)
      if (req.query.channelId) ids = ids.filter((i) => i === Number(req.query.channelId))
      if (!query) return { hits: [], estimatedTotal: 0, tookMs: 0, engine }
      return searchMessages(query, ids)
    })

    auth.post('/api/admin/reindex', async () => {
      await enqueue('jobs.reindex', { requestedAt: new Date().toISOString() })
      return { queued: true }
    })
  })
}
