import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import type {
  Attachment, BootstrapPayload, Channel, Message, MessagePage, PresenceStatus, Reaction, ServerEvent, UploadTicket, User,
} from '@shared/types'
import { api, ApiError, session } from '../lib/api'
import { ChatSocket, type SocketState } from '../lib/socket'
import { firstName } from '../lib/format'
import { mentionsMe, setMentionContext } from '../lib/markdown'

export interface LocalMessage extends Message {
  pending?: boolean
  failed?: string
  localFiles?: { name: string; url: string | null; mime: string; size: number }[]
  retry?: () => void
}

interface ChannelView {
  messages: LocalMessage[]
  hasOlder: boolean
  hasNewer: boolean
  loading: 'older' | 'newer' | 'initial' | null
  /** Snapshot of the read marker when the channel was opened, for the "New" divider. */
  unreadFrom: number
}

interface ThreadView {
  rootId: number
  root: LocalMessage | null
  replies: LocalMessage[]
  loading: boolean
}

// Cap on rendered messages per channel: loading one end trims the far end, so the DOM stays small
// and scrolling stays smooth no matter how deep the history goes.
const MAX_IN_VIEW = 250
const PAGE = 50
let tempId = -1

export const useChat = defineStore('chat', () => {
  const me = ref<User | null>(null)
  const users = reactive(new Map<number, User>())
  const channels = ref<Channel[]>([])
  const unreads = ref<Record<number, number>>({})
  const mentions = ref<Record<number, number>>({})
  const lastReadIds = ref<Record<number, number>>({})
  const presence = ref<Record<number, PresenceStatus>>({})
  const views = reactive(new Map<number, ChannelView>())
  const activeId = ref<number | null>(null)
  const thread = ref<ThreadView | null>(null)
  const typing = reactive(new Map<number, Map<number, number>>()) // channel -> user -> expiresAt
  const channelPresence = ref<{ channelId: number; members: number[]; active: number[] } | null>(null)
  const highlightId = ref<number | null>(null)
  const socketState = ref<SocketState>('connecting')
  const socketInstance = ref<string>('')
  const apiInstance = ref<string>('')
  const searchEngine = ref<'meilisearch' | 'postgres'>('meilisearch')
  const eventsReceived = ref(0)
  const lastSync = ref<{ at: string; recovered: number } | null>(null)
  const toast = ref<{ text: string; kind: 'info' | 'error' } | null>(null)
  const ready = ref(false)
  const socket = shallowRef<ChatSocket | null>(null)

  let lastSeenId = 0
  let lastSyncAt = new Date().toISOString()

  const active = computed(() => channels.value.find((c) => c.id === activeId.value) ?? null)
  const activeView = computed(() => (activeId.value ? views.get(activeId.value) : undefined))
  const channelById = (id: number) => channels.value.find((c) => c.id === id)
  const userName = (id: number) => users.get(id)?.name ?? 'Someone'

  function notify(text: string, kind: 'info' | 'error' = 'info') {
    toast.value = { text, kind }
    const current = toast.value
    setTimeout(() => toast.value === current && (toast.value = null), 3500)
  }

  function seen(id: number) {
    if (id > lastSeenId) lastSeenId = id
  }

  function refreshMentionContext() {
    if (me.value) setMentionContext(firstName(me.value.name), [...users.values()].map((u) => firstName(u.name)))
  }

  // ---------------------------------------------------------------- bootstrap
  async function init() {
    const data = await api<BootstrapPayload>('/api/bootstrap')
    me.value = data.me
    users.clear()
    for (const u of data.users) users.set(u.id, u)
    channels.value = data.channels
    unreads.value = data.unreads
    mentions.value = data.mentions
    lastReadIds.value = data.lastReadIds
    presence.value = data.presence
    apiInstance.value = data.instance
    searchEngine.value = data.searchEngine
    lastSyncAt = data.serverTime
    refreshMentionContext()

    const s = new ChatSocket(handleEvent, (st) => (socketState.value = st), resync)
    socket.value = s
    s.connect()
    trackAway(s)
    setInterval(pruneTyping, 1000)
    ready.value = true
  }

  function trackAway(s: ChatSocket) {
    let idleTimer: number | undefined
    const markActive = () => {
      if (!document.hidden) s.setStatus('online')
      clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => s.setStatus('away'), 3 * 60_000)
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) s.setStatus('away')
      else {
        markActive()
        if (activeId.value) markRead(activeId.value)
      }
    })
    for (const ev of ['mousemove', 'keydown', 'pointerdown']) window.addEventListener(ev, markActive, { passive: true })
    window.addEventListener('online', () => s.reconnect())
    markActive()
  }

  function logout() {
    socket.value?.close()
    session.token = null
    location.href = '/'
  }

  // ---------------------------------------------------------------- reconnect catch-up
  /** After a reconnect, pull every message created (and every edit/delete) we missed while offline. */
  async function resync() {
    try {
      const res = await api<{
        messages: Message[]; serverTime: string; unreads: Record<number, number>; mentions: Record<number, number>; presence: Record<number, PresenceStatus>
      }>(`/api/sync?sinceId=${lastSeenId}&sinceTs=${encodeURIComponent(lastSyncAt)}&watch=${activeId.value ?? ''}`)
      let recovered = 0
      for (const m of res.messages) {
        const known = findMessage(m.id)
        if (known) patchMessage(m.id, m)
        else {
          if (m.replyToId) addReply(m)
          else insertMessage(m)
          recovered++
        }
        seen(m.id)
      }
      unreads.value = res.unreads
      mentions.value = res.mentions
      presence.value = res.presence
      lastSyncAt = res.serverTime
      lastSync.value = { at: res.serverTime, recovered }
      if (recovered) notify(`Back online — caught up on ${recovered} message${recovered === 1 ? '' : 's'}`)
      if (activeId.value) {
        markRead(activeId.value)
        loadPresence(activeId.value)
      }
    } catch (err) {
      console.error('resync failed', err)
    }
  }

  // ---------------------------------------------------------------- channels
  function ensureView(cid: number): ChannelView {
    let v = views.get(cid)
    if (!v) {
      v = { messages: [], hasOlder: true, hasNewer: false, loading: null, unreadFrom: lastReadIds.value[cid] ?? 0 }
      views.set(cid, v)
    }
    return v
  }

  async function openChannel(slug: string, jumpTo?: number) {
    const ch = channels.value.find((c) => c.slug === slug)
    if (!ch) return false
    const switching = activeId.value !== ch.id
    activeId.value = ch.id
    socket.value?.watch(ch.id)
    if (switching) {
      thread.value = null
      const v = ensureView(ch.id)
      v.unreadFrom = lastReadIds.value[ch.id] ?? 0
    }
    loadPresence(ch.id)
    if (jumpTo) await jump(jumpTo)
    else if (switching || !views.get(ch.id)?.messages.length) {
      const v = ensureView(ch.id)
      if (!v.messages.length || v.hasNewer) await loadLatest(ch.id)
    }
    markRead(ch.id)
    return true
  }

  async function loadLatest(cid: number) {
    const v = ensureView(cid)
    v.loading = 'initial'
    try {
      const page = await api<MessagePage>(`/api/channels/${cid}/messages?limit=${PAGE}`)
      v.messages = page.messages
      v.hasOlder = page.hasOlder
      v.hasNewer = false
      page.messages.forEach((m) => seen(m.id))
    } finally {
      v.loading = null
    }
  }

  const cursorOf = (m: Message) => encodeURIComponent(`${m.createdAt}~${m.id}`)

  async function loadOlder(cid: number) {
    const v = ensureView(cid)
    const first = v.messages.find((m) => m.id > 0)
    if (v.loading || !v.hasOlder || !first) return
    v.loading = 'older'
    try {
      const page = await api<MessagePage>(`/api/channels/${cid}/messages?before=${cursorOf(first)}&limit=${PAGE}`)
      const known = new Set(v.messages.map((m) => m.id))
      v.messages = [...page.messages.filter((m) => !known.has(m.id)), ...v.messages]
      v.hasOlder = page.hasOlder
      if (v.messages.length > MAX_IN_VIEW) {
        v.messages = v.messages.slice(0, MAX_IN_VIEW)
        v.hasNewer = true
      }
    } finally {
      v.loading = null
    }
  }

  async function loadNewer(cid: number) {
    const v = ensureView(cid)
    const last = [...v.messages].reverse().find((m) => m.id > 0)
    if (v.loading || !v.hasNewer || !last) return
    v.loading = 'newer'
    try {
      const page = await api<MessagePage>(`/api/channels/${cid}/messages?after=${cursorOf(last)}&limit=${PAGE}`)
      const known = new Set(v.messages.map((m) => m.id))
      v.messages = [...v.messages, ...page.messages.filter((m) => !known.has(m.id))]
      v.hasNewer = page.hasNewer
      if (v.messages.length > MAX_IN_VIEW) {
        v.messages = v.messages.slice(v.messages.length - MAX_IN_VIEW)
        v.hasOlder = true
      }
      page.messages.forEach((m) => seen(m.id))
    } finally {
      v.loading = null
    }
  }

  async function jumpToLatest() {
    if (activeId.value) await loadLatest(activeId.value)
  }

  /** Load a window of history around a message (from search) and highlight it. */
  async function jump(messageId: number) {
    const ctx = await api<{ channelId: number; anchorId: number; threadRootId: number | null; page: MessagePage }>(
      `/api/messages/${messageId}/context`,
    )
    const v = ensureView(ctx.channelId)
    v.messages = ctx.page.messages
    v.hasOlder = ctx.page.hasOlder
    v.hasNewer = ctx.page.hasNewer
    highlightId.value = ctx.anchorId
    if (ctx.threadRootId) await openThread(ctx.threadRootId, messageId)
    setTimeout(() => highlightId.value === ctx.anchorId && (highlightId.value = null), 3000)
  }

  async function createChannel(name: string, topic: string, isPrivate: boolean) {
    const ch = await api<Channel>('/api/channels', { body: { name, topic, isPrivate } })
    upsertChannel(ch)
    return ch
  }

  async function joinChannel(cid: number) {
    const ch = await api<Channel>(`/api/channels/${cid}/join`, { method: 'POST' })
    upsertChannel(ch)
  }

  async function leaveChannel(cid: number) {
    await api(`/api/channels/${cid}/leave`, { method: 'POST' })
    const ch = channelById(cid)
    if (ch) {
      ch.isMember = false
      if (ch.isPrivate) channels.value = channels.value.filter((c) => c.id !== cid)
    }
    delete unreads.value[cid]
    delete mentions.value[cid]
  }

  function upsertChannel(ch: Channel) {
    const i = channels.value.findIndex((c) => c.id === ch.id)
    if (i >= 0) channels.value[i] = { ...channels.value[i], ...ch }
    else channels.value = [...channels.value, ch].sort((a, b) => a.name.localeCompare(b.name))
  }

  async function loadPresence(cid: number) {
    try {
      const p = await api<{ members: number[]; active: number[]; typing: number[] }>(`/api/channels/${cid}/presence`)
      if (activeId.value !== cid) return
      channelPresence.value = { channelId: cid, members: p.members, active: p.active }
      const map = typing.get(cid) ?? new Map()
      for (const u of p.typing) map.set(u, Date.now() + 6000)
      typing.set(cid, map)
    } catch {}
  }

  // ---------------------------------------------------------------- read state
  let readTimer: number | undefined
  function markRead(cid: number) {
    const v = views.get(cid)
    const ch = channelById(cid)
    if (!v || !ch?.isMember || document.hidden || v.hasNewer) return
    const newest = [...v.messages].reverse().find((m) => m.id > 0)
    const hadUnread = (unreads.value[cid] ?? 0) > 0 || (mentions.value[cid] ?? 0) > 0
    if (!newest || (newest.id <= (lastReadIds.value[cid] ?? 0) && !hadUnread)) return
    delete unreads.value[cid]
    delete mentions.value[cid]
    lastReadIds.value[cid] = Math.max(lastReadIds.value[cid] ?? 0, newest.id)
    clearTimeout(readTimer)
    readTimer = window.setTimeout(() => {
      api(`/api/channels/${cid}/read`, { body: { messageId: newest.id } }).catch(() => {})
    }, 400)
  }

  // ---------------------------------------------------------------- sending
  async function uploadFile(file: File): Promise<{ key: string; filename: string; mime: string; size: number }> {
    const ticket = await api<UploadTicket>('/api/uploads', { body: { filename: file.name, mime: file.type, size: file.size } })
    // Straight to object storage — the API never proxies the bytes.
    const res = await fetch(ticket.putUrl, { method: 'PUT', headers: ticket.headers, body: file })
    if (!res.ok) throw new Error(`Upload of ${file.name} failed (${res.status})`)
    return { key: ticket.key, filename: file.name, mime: file.type || 'application/octet-stream', size: file.size }
  }

  /** Optimistic send: the message renders instantly, then reconciles with the server copy by clientId. */
  async function send(cid: number, body: string, files: File[] = [], replyToId: number | null = null) {
    if (!me.value) return
    const clientId = crypto.randomUUID()
    const local: LocalMessage = reactive({
      id: tempId--,
      channelId: cid,
      userId: me.value.id,
      body,
      replyToId,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      attachments: [],
      reactions: [],
      replyCount: 0,
      lastReplyAt: null,
      replyUserIds: [],
      clientId,
      pending: true,
      localFiles: files.map((f) => ({ name: f.name, mime: f.type, size: f.size, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })),
    })
    if (replyToId) {
      if (thread.value?.rootId === replyToId) thread.value.replies.push(local)
    } else {
      const v = ensureView(cid)
      if (v.hasNewer) await loadLatest(cid)
      v.messages.push(local)
    }

    const attempt = async () => {
      local.failed = undefined
      local.pending = true
      try {
        const uploaded = await Promise.all(files.map(uploadFile))
        const saved = await api<Message>(`/api/channels/${cid}/messages`, { body: { body, clientId, replyToId, attachments: uploaded } })
        reconcile(saved, clientId)
      } catch (err) {
        local.pending = false
        local.failed = err instanceof ApiError || err instanceof Error ? err.message : 'Failed to send'
        if (err instanceof ApiError && err.status === 429) notify(err.message, 'error')
      }
    }
    local.retry = attempt
    await attempt()
  }

  function reconcile(saved: Message, clientId?: string) {
    seen(saved.id)
    const lists = saved.replyToId ? (thread.value?.rootId === saved.replyToId ? [thread.value.replies] : []) : [views.get(saved.channelId)?.messages ?? []]
    for (const list of lists) {
      const byId = list.findIndex((m) => m.id === saved.id)
      const byClient = clientId ? list.findIndex((m) => m.clientId === clientId && m.id < 0) : -1
      if (byClient >= 0) {
        const localFiles = list[byClient]!.localFiles
        if (byId >= 0) list.splice(byClient, 1)
        else list[byClient] = { ...saved, localFiles: saved.attachments.length ? undefined : localFiles }
      } else if (byId < 0 && !saved.replyToId) {
        insertInto(list, saved)
      }
    }
  }

  function discardFailed(m: LocalMessage) {
    const lists = [views.get(m.channelId)?.messages, thread.value?.replies].filter(Boolean) as LocalMessage[][]
    for (const list of lists) {
      const i = list.indexOf(m)
      if (i >= 0) list.splice(i, 1)
    }
  }

  async function edit(id: number, body: string) {
    const saved = await api<Message>(`/api/messages/${id}`, { method: 'PATCH', body: { body } })
    patchMessage(id, saved)
  }

  async function remove(id: number) {
    await api(`/api/messages/${id}`, { method: 'DELETE' })
  }

  async function react(m: Message, emoji: string) {
    if (!me.value || m.id < 0) return
    // Optimistic toggle; the server's reactions.updated event is authoritative.
    const uid = me.value.id
    const list: Reaction[] = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }))
    const r = list.find((x) => x.emoji === emoji)
    if (r?.userIds.includes(uid)) {
      r.userIds = r.userIds.filter((u) => u !== uid)
      r.count--
    } else if (r) {
      r.userIds.push(uid)
      r.count++
    } else list.push({ emoji, count: 1, userIds: [uid] })
    patchMessage(m.id, { reactions: list.filter((x) => x.count > 0) })
    try {
      const reactions = await api<Reaction[]>(`/api/messages/${m.id}/reactions`, { body: { emoji } })
      patchMessage(m.id, { reactions })
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  function typingPing(cid: number) {
    socket.value?.send({ type: 'typing', channelId: cid })
  }

  // ---------------------------------------------------------------- threads
  async function openThread(rootId: number, highlight?: number) {
    thread.value = { rootId, root: findMessage(rootId) ?? null, replies: [], loading: true }
    const t = await api<{ root: Message; replies: Message[] }>(`/api/messages/${rootId}/thread`)
    if (thread.value?.rootId !== rootId) return
    thread.value.root = t.root
    thread.value.replies = t.replies
    thread.value.loading = false
    t.replies.forEach((m) => seen(m.id))
    if (highlight) highlightId.value = highlight
  }

  function closeThread() {
    thread.value = null
  }

  // ---------------------------------------------------------------- message bookkeeping
  function allLists(): LocalMessage[][] {
    const lists = [...views.values()].map((v) => v.messages)
    if (thread.value) {
      lists.push(thread.value.replies)
      if (thread.value.root) lists.push([thread.value.root])
    }
    return lists
  }

  function findMessage(id: number): LocalMessage | undefined {
    for (const list of allLists()) {
      const m = list.find((x) => x.id === id)
      if (m) return m
    }
  }

  function patchMessage(id: number, patch: Partial<Message>) {
    for (const list of allLists()) {
      const i = list.findIndex((x) => x.id === id)
      if (i >= 0) list[i] = { ...list[i]!, ...patch }
    }
    if (thread.value?.root?.id === id) thread.value.root = { ...thread.value.root, ...patch }
  }

  function insertInto(list: LocalMessage[], m: Message) {
    if (list.some((x) => x.id === m.id)) return
    // Keep chronological order; optimistic (negative id) messages stay pinned at the bottom.
    let i = list.length
    while (i > 0 && (list[i - 1]!.id < 0 || list[i - 1]!.createdAt > m.createdAt)) i--
    list.splice(i, 0, m)
  }

  function insertMessage(m: Message) {
    const v = views.get(m.channelId)
    if (!v || v.hasNewer || !v.messages.length) return
    const pending = m.clientId ? v.messages.findIndex((x) => x.clientId === m.clientId && x.id < 0) : -1
    if (pending >= 0) v.messages[pending] = { ...m }
    else insertInto(v.messages, m)
    if (v.messages.length > MAX_IN_VIEW + PAGE) {
      v.messages = v.messages.slice(v.messages.length - MAX_IN_VIEW)
      v.hasOlder = true
    }
  }

  function addReply(m: Message) {
    const t = thread.value
    if (!t || t.rootId !== m.replyToId) return
    const pending = m.clientId ? t.replies.findIndex((x) => x.clientId === m.clientId && x.id < 0) : -1
    if (pending >= 0) t.replies[pending] = { ...m }
    else if (!t.replies.some((x) => x.id === m.id)) t.replies.push(m)
  }

  function pruneTyping() {
    const now = Date.now()
    for (const [cid, map] of typing) for (const [uid, exp] of map) if (exp < now) map.delete(uid), typing.set(cid, map)
  }

  // ---------------------------------------------------------------- realtime events
  function handleEvent(ev: ServerEvent) {
    eventsReceived.value++
    switch (ev.type) {
      case 'hello':
        socketInstance.value = ev.instance
        break
      case 'message.created': {
        const m = ev.message
        seen(m.id)
        typing.get(m.channelId)?.delete(m.userId)
        if (m.replyToId) addReply(m)
        else insertMessage(m)
        const mine = m.userId === me.value?.id
        const ch = channelById(m.channelId)
        if (!mine && ch?.isMember) {
          const viewing = activeId.value === m.channelId && !document.hidden && !views.get(m.channelId)?.hasNewer
          if (viewing) markRead(m.channelId)
          else {
            if (!m.replyToId) unreads.value[m.channelId] = (unreads.value[m.channelId] ?? 0) + 1
            if (mentionsMe(m.body)) mentions.value[m.channelId] = (mentions.value[m.channelId] ?? 0) + 1
          }
        }
        break
      }
      case 'message.updated':
        patchMessage(ev.message.id, ev.message)
        break
      case 'message.deleted': {
        patchMessage(ev.id, { deletedAt: new Date().toISOString(), body: '', attachments: [], reactions: [] })
        if (thread.value?.rootId === ev.replyToId) thread.value.replies = thread.value.replies.filter((r) => r.id !== ev.id)
        break
      }
      case 'reactions.updated':
        patchMessage(ev.messageId, { reactions: ev.reactions })
        break
      case 'thread.updated':
        patchMessage(ev.messageId, { replyCount: ev.replyCount, lastReplyAt: ev.lastReplyAt, replyUserIds: ev.replyUserIds })
        break
      case 'attachment.updated': {
        const m = findMessage(ev.attachment.messageId)
        if (m) {
          const attachments: Attachment[] = m.attachments.some((a) => a.id === ev.attachment.id)
            ? m.attachments.map((a) => (a.id === ev.attachment.id ? ev.attachment : a))
            : [...m.attachments, ev.attachment]
          patchMessage(m.id, { attachments, localFiles: undefined } as Partial<LocalMessage>)
        }
        break
      }
      case 'typing': {
        if (ev.userId === me.value?.id) break
        const map = typing.get(ev.channelId) ?? new Map<number, number>()
        if (ev.active) map.set(ev.userId, Date.now() + 6000)
        else map.delete(ev.userId)
        typing.set(ev.channelId, map)
        break
      }
      case 'presence':
        presence.value = { ...presence.value, [ev.userId]: ev.status }
        if (ev.status === 'offline' && channelPresence.value) {
          channelPresence.value.active = channelPresence.value.active.filter((u) => u !== ev.userId)
        } else if (channelPresence.value && activeId.value && channelPresence.value.members.includes(ev.userId) && !channelPresence.value.active.includes(ev.userId)) {
          channelPresence.value.active = [...channelPresence.value.active, ev.userId]
        }
        break
      case 'channel.created':
        upsertChannel(ev.channel)
        break
      case 'channel.updated':
        upsertChannel(ev.channel)
        break
      case 'member.joined': {
        const ch = channelById(ev.channelId)
        if (ch) {
          if (ev.userId === me.value?.id) ch.isMember = true
          ch.memberCount++
        }
        if (channelPresence.value?.channelId === ev.channelId && !channelPresence.value.members.includes(ev.userId)) {
          channelPresence.value.members = [...channelPresence.value.members, ev.userId]
        }
        break
      }
      case 'member.left': {
        const ch = channelById(ev.channelId)
        if (ch) ch.memberCount = Math.max(0, ch.memberCount - 1)
        if (channelPresence.value?.channelId === ev.channelId) {
          channelPresence.value.members = channelPresence.value.members.filter((u) => u !== ev.userId)
        }
        break
      }
      case 'user.created':
        users.set(ev.user.id, ev.user)
        refreshMentionContext()
        break
      case 'read':
        // Another tab of mine read this channel.
        delete unreads.value[ev.channelId]
        delete mentions.value[ev.channelId]
        lastReadIds.value[ev.channelId] = Math.max(lastReadIds.value[ev.channelId] ?? 0, ev.messageId)
        break
    }
  }

  const typingIn = (cid: number) => [...(typing.get(cid)?.keys() ?? [])].filter((u) => u !== me.value?.id)

  return {
    me, users, channels, unreads, mentions, lastReadIds, presence, views, activeId, active, activeView, thread, typing,
    channelPresence, highlightId, socketState, socketInstance, apiInstance, searchEngine, eventsReceived, lastSync, toast, ready,
    socket, channelById, userName, init, logout, openChannel, loadOlder, loadNewer, jump, jumpToLatest, createChannel,
    joinChannel, leaveChannel, markRead, send, edit, remove, react, typingPing, openThread, closeThread, discardFailed,
    typingIn, notify,
  }
})
