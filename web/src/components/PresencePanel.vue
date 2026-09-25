<script setup lang="ts">
import { computed } from 'vue'
import type { PresenceStatus, User } from '@shared/types'
import { useChat } from '../stores/chat'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

const chat = useChat()
const groups = computed(() => {
  const cp = chat.channelPresence
  const ids = cp && cp.channelId === chat.activeId ? cp.members : []
  const out: Record<PresenceStatus, User[]> = { online: [], away: [], offline: [] }
  for (const id of ids) {
    const u = chat.users.get(id)
    if (u) out[chat.presence[id] ?? 'offline'].push(u)
  }
  for (const k of Object.keys(out) as PresenceStatus[]) out[k].sort((a, b) => a.name.localeCompare(b.name))
  return out
})
const here = (id: number) => chat.channelPresence?.active.includes(id)
const labels: Record<PresenceStatus, string> = { online: 'Online', away: 'Away', offline: 'Offline' }
</script>

<template>
  <aside class="presence">
    <header><h3>People</h3><span class="count">{{ groups.online.length + groups.away.length }} online</span></header>
    <div class="scroll body">
      <template v-for="s in (['online', 'away', 'offline'] as PresenceStatus[])" :key="s">
        <section v-if="groups[s].length">
          <h4><span class="dot" :class="s" /> {{ labels[s] }} — {{ groups[s].length }}</h4>
          <TransitionGroup name="person" tag="ul">
            <li v-for="u in groups[s]" :key="u.id" :class="s">
              <Avatar :user="u" :size="32" :status="s" />
              <span class="name">{{ u.name }}<small v-if="u.id === chat.me?.id"> (you)</small></span>
              <span v-if="s !== 'offline' && here(u.id)" class="here" title="Has this channel's members list live in a socket right now">here</span>
            </li>
          </TransitionGroup>
        </section>
      </template>
    </div>

    <div class="rt">
      <div class="rt-head"><Icon name="zap" /> Realtime</div>
      <dl>
        <dt>Socket</dt>
        <dd><span class="state" :class="chat.socketState" />{{ chat.socketState }}</dd>
        <dt>Instance</dt>
        <dd class="mono">{{ chat.socketInstance || '—' }}</dd>
        <dt>Events</dt>
        <dd>{{ chat.eventsReceived }} received</dd>
        <dt>Search</dt>
        <dd>{{ chat.searchEngine === 'meilisearch' ? 'Meilisearch' : 'Postgres FTS' }}</dd>
      </dl>
      <button class="btn ghost small" title="Drop and re-open the WebSocket; missed messages are fetched on reconnect" @click="chat.socket?.reconnect()">
        <Icon name="refresh" /> Reconnect
      </button>
      <p v-if="chat.lastSync" class="synced">Last catch-up recovered {{ chat.lastSync.recovered }} message{{ chat.lastSync.recovered === 1 ? '' : 's' }}</p>
    </div>
  </aside>
</template>

<style scoped>
.presence { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--chrome); border-left: 1px solid var(--line); }
header { display: flex; align-items: baseline; justify-content: space-between; padding: 22px 18px 8px; }
h3 { margin: 0; font-size: 16px; letter-spacing: -0.01em; }
.count { font-size: 12px; color: var(--muted); font-weight: 600; }
.body { flex: 1; min-height: 0; padding: 0 10px; }
h4 { display: flex; align-items: center; gap: 6px; margin: 14px 8px 6px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); }
h4 .dot { width: 8px; height: 8px; border: 0; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 12px; transition: background 0.15s; }
li:hover { background: #F2EFFC; }
li.away .name { opacity: 0.7; }
li.offline { opacity: 0.55; }
.name { flex: 1; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name small { color: var(--muted); font-weight: 500; }
.here { font-size: 10.5px; font-weight: 800; color: #179E4B; background: #E3FAEC; padding: 1px 7px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em; }
.person-move, .person-enter-active { transition: all 0.4s var(--spring); }
.person-leave-active { transition: all 0.2s; position: absolute; }
.person-enter-from, .person-leave-to { opacity: 0; transform: translateX(10px); }
.rt { margin: 10px; padding: 14px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow-sm); }
.rt-head { display: flex; align-items: center; gap: 6px; font-weight: 800; font-size: 13px; color: var(--accent-ink); margin-bottom: 8px; }
.rt-head svg { width: 15px; height: 15px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0 0 10px; font-size: 12.5px; }
dt { color: var(--muted); }
dd { margin: 0; font-weight: 600; display: flex; align-items: center; gap: 6px; text-transform: none; }
.mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.state { width: 8px; height: 8px; border-radius: 50%; background: var(--away); }
.state.open { background: var(--online); }
.btn.small { height: 32px; font-size: 13px; padding: 0 12px; width: 100%; }
.btn.small svg { width: 14px; height: 14px; }
.synced { margin: 8px 0 0; font-size: 11.5px; color: var(--muted); }
</style>
