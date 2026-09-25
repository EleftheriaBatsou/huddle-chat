<script setup lang="ts">
import { computed } from 'vue'
import { useChat } from '../stores/chat'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

defineEmits<{ search: []; create: [] }>()
const chat = useChat()
const mine = computed(() => chat.channels.filter((c) => c.isMember))
const others = computed(() => chat.channels.filter((c) => !c.isMember))
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
</script>

<template>
  <nav class="sidebar">
    <header class="workspace">
      <img src="/favicon.svg" alt="" width="32" height="32" />
      <div class="ws-name">Huddle</div>
    </header>

    <button class="search" @click="$emit('search')">
      <Icon name="search" />
      <span>Search messages</span>
      <span class="kbd">{{ isMac ? '⌘' : 'Ctrl' }} K</span>
    </button>

    <div class="scroll list">
      <div class="section">
        <span>Channels</span>
        <button class="icon-btn small" title="Create channel" @click="$emit('create')"><Icon name="plus" /></button>
      </div>
      <TransitionGroup name="row" tag="ul">
        <li v-for="c in mine" :key="c.id">
          <RouterLink :to="`/c/${c.slug}`" class="chan" :class="{ active: c.id === chat.activeId, unread: chat.unreads[c.id] }">
            <Icon :name="c.isPrivate ? 'lock' : 'hash'" class="glyph" />
            <span class="name">{{ c.name }}</span>
            <Transition name="badge">
              <span v-if="chat.mentions[c.id]" class="badge mention" :key="'m' + chat.mentions[c.id]">@{{ chat.mentions[c.id] }}</span>
              <span v-else-if="chat.unreads[c.id] && c.id !== chat.activeId" class="badge" :key="'u' + chat.unreads[c.id]">{{ chat.unreads[c.id]! > 99 ? '99+' : chat.unreads[c.id] }}</span>
            </Transition>
          </RouterLink>
        </li>
      </TransitionGroup>

      <template v-if="others.length">
        <div class="section"><span>More channels</span></div>
        <ul>
          <li v-for="c in others" :key="c.id">
            <RouterLink :to="`/c/${c.slug}`" class="chan dim" :class="{ active: c.id === chat.activeId }">
              <Icon name="hash" class="glyph" />
              <span class="name">{{ c.name }}</span>
              <span class="join">join</span>
            </RouterLink>
          </li>
        </ul>
      </template>
    </div>

    <footer class="me" v-if="chat.me">
      <Avatar :user="chat.me" :size="36" :status="chat.presence[chat.me.id] ?? 'online'" />
      <div class="me-text">
        <strong>{{ chat.me.name }}</strong>
        <span class="conn" :class="chat.socketState">
          <i />{{ chat.socketState === 'open' ? 'Connected' : chat.socketState === 'offline' ? 'Offline' : 'Reconnecting…' }}
        </span>
      </div>
      <button class="icon-btn" title="Sign out" @click="chat.logout()"><Icon name="logout" /></button>
    </footer>
  </nav>
</template>

<style scoped>
.sidebar { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--chrome); border-right: 1px solid var(--line); padding: 14px 10px 10px; }
.workspace { display: flex; align-items: center; gap: 10px; padding: 4px 8px 14px; }
.ws-name { font-weight: 800; font-size: 18px; letter-spacing: -0.02em; }
.search {
  display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 10px 0 12px; margin: 0 2px 10px;
  border-radius: 12px; background: var(--surface); border: 1px solid var(--line-2); color: var(--muted); font-size: 14px;
  box-shadow: var(--shadow-sm); transition: border-color 0.15s, transform 0.25s var(--spring);
}
.search:hover { border-color: #CFC5FF; transform: translateY(-1px); }
.search svg { width: 16px; height: 16px; }
.search span:nth-child(2) { flex: 1; text-align: left; }
.list { flex: 1; min-height: 0; padding: 0 2px; }
.section { display: flex; align-items: center; justify-content: space-between; padding: 12px 10px 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.icon-btn.small { width: 26px; height: 26px; }
.icon-btn.small svg { width: 16px; height: 16px; }
ul { list-style: none; margin: 0; padding: 0; }
.chan {
  display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px; border-radius: 10px; margin: 1px 0;
  color: var(--ink-2); text-decoration: none; font-weight: 500; transition: background 0.15s, color 0.15s;
}
.chan:hover { background: #F2EFFC; }
.chan.active { background: var(--accent); color: #fff; box-shadow: 0 6px 16px -8px rgba(124, 92, 255, 0.8); }
.chan.unread { color: var(--ink); font-weight: 800; }
.chan.active.unread { color: #fff; }
.chan.dim { color: var(--muted); }
.glyph { width: 16px; height: 16px; flex: none; opacity: 0.7; }
.name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  min-width: 22px; height: 20px; padding: 0 7px; border-radius: 10px; display: grid; place-items: center;
  background: var(--accent); color: #fff; font-size: 11.5px; font-weight: 800;
}
.badge.mention { background: var(--coral); }
.chan.active .badge { background: #fff; color: var(--accent-ink); }
.join { font-size: 12px; font-weight: 700; color: var(--accent); opacity: 0; transition: opacity 0.15s; }
.chan:hover .join { opacity: 1; }
.badge-enter-active { transition: transform 0.35s var(--spring); }
.badge-enter-from { transform: scale(0.4); }
.row-enter-active { transition: all 0.35s var(--spring); }
.row-enter-from { opacity: 0; transform: translateX(-10px); }
.me { display: flex; align-items: center; gap: 10px; padding: 10px 8px 4px; border-top: 1px solid var(--line); margin-top: 8px; }
.me-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.me-text strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conn { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
.conn i { width: 7px; height: 7px; border-radius: 50%; background: var(--away); }
.conn.open i { background: var(--online); }
.conn.offline i { background: var(--offline); }
.conn.reconnecting i, .conn.connecting i { animation: blink 1s infinite; }
@keyframes blink { 50% { opacity: 0.3; } }
</style>
