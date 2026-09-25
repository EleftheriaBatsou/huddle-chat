import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from './config.js'
import { verifyToken } from './auth.js'
import { q } from './db.js'
import { subscribe } from './bus.js'
import { heartbeat, socketGone, setTyping, sweepPresence } from './realtime.js'
import { canView } from './access.js'
import type { BusEnvelope, ClientFrame, ServerEvent } from '../shared/types.js'

interface Conn {
  ws: WebSocket
  userId: number
  channels: Set<number> // member channels
  watching: number | null // currently viewed channel (may be a public non-member channel)
  status: 'online' | 'away'
  alive: boolean
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
const byUser = new Map<number, Set<Conn>>()
const all = new Set<Conn>()
export const stats = { delivered: 0, fromOtherInstances: 0 }

const send = (c: Conn, ev: ServerEvent) => c.ws.readyState === WebSocket.OPEN && c.ws.send(JSON.stringify(ev))
const listens = (c: Conn, cid: number) => c.channels.has(cid) || c.watching === cid

/** Every event arrives here from Valkey — including ones this instance published itself. */
function deliver(env: BusEnvelope) {
  const { route, event } = env
  if (env.origin !== config.instance) stats.fromOtherInstances++

  // Membership changes update the socket's subscriptions before routing.
  if (event.type === 'member.joined' || event.type === 'member.left') {
    for (const c of byUser.get(event.userId) ?? []) {
      if (event.type === 'member.joined') c.channels.add(event.channelId)
      else c.channels.delete(event.channelId)
    }
  }

  let targets: Iterable<Conn>
  if (route.all) targets = all
  else if (route.userIds) targets = route.userIds.flatMap((u) => [...(byUser.get(u) ?? [])])
  else if (route.channelId != null) targets = [...all].filter((c) => listens(c, route.channelId!))
  else return
  for (const c of targets) {
    send(c, event)
    stats.delivered++
  }
}

export async function initHub() {
  await subscribe(deliver)
  setInterval(() => sweepPresence().catch((e) => console.error('sweep', e.message)), 5000)
  // Protocol-level pings keep idle sockets alive through the L7 balancer and reap dead ones.
  setInterval(() => {
    for (const c of all) {
      if (!c.alive) {
        c.ws.terminate()
        continue
      }
      c.alive = false
      c.ws.ping()
    }
  }, 25_000)
}

export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const url = new URL(req.url ?? '/', 'http://x')
  const userId = verifyToken(url.searchParams.get('token'))
  if (!userId) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, userId))
}

async function onConnection(ws: WebSocket, userId: number) {
  const rows = await q<{ channel_id: number }>('SELECT channel_id FROM channel_members WHERE user_id = $1', [userId])
  const conn: Conn = { ws, userId, channels: new Set(rows.map((r) => r.channel_id)), watching: null, status: 'online', alive: true }
  all.add(conn)
  if (!byUser.has(userId)) byUser.set(userId, new Set())
  byUser.get(userId)!.add(conn)

  send(conn, { type: 'hello', instance: config.instance, serverTime: new Date().toISOString(), userId })
  heartbeat(userId, 'online', conn.channels).catch(() => {})

  ws.on('pong', () => (conn.alive = true))
  ws.on('message', async (raw) => {
    conn.alive = true
    let frame: ClientFrame
    try {
      frame = JSON.parse(String(raw))
    } catch {
      return
    }
    try {
      switch (frame.type) {
        case 'hb':
          conn.status = frame.status === 'away' ? 'away' : 'online'
          await heartbeat(userId, conn.status, conn.channels)
          break
        case 'typing':
          if (listens(conn, frame.channelId)) await setTyping(frame.channelId, userId, true)
          break
        case 'watch':
          conn.watching = frame.channelId != null && (await canView(userId, frame.channelId)) ? frame.channelId : null
          break
        case 'ping':
          send(conn, { type: 'pong', instance: config.instance })
          break
      }
    } catch (err) {
      console.error('ws frame error', err)
    }
  })
  ws.on('close', () => {
    all.delete(conn)
    const set = byUser.get(userId)
    set?.delete(conn)
    if (set && set.size === 0) {
      byUser.delete(userId)
      socketGone(userId).catch(() => {})
    }
  })
}

export const localConnections = () => ({ sockets: all.size, users: byUser.size })
