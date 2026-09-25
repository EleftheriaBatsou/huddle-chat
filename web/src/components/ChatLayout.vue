<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChat } from '../stores/chat'
import ChannelSidebar from './ChannelSidebar.vue'
import MessagePane from './MessagePane.vue'
import PresencePanel from './PresencePanel.vue'
import ThreadPanel from './ThreadPanel.vue'
import SearchModal from './SearchModal.vue'
import CreateChannelModal from './CreateChannelModal.vue'

const chat = useChat()
const route = useRoute()
const router = useRouter()
const searchOpen = ref(false)
const createOpen = ref(false)
const navOpen = ref(false)

async function sync() {
  const slug = String(route.params.slug ?? 'general')
  const m = route.query.m ? Number(route.query.m) : undefined
  const ok = await chat.openChannel(slug, m)
  if (!ok) router.replace('/c/general')
  else if (m) router.replace({ path: route.path, query: {} })
  navOpen.value = false
}

watch(() => [route.params.slug, route.query.m], sync)
watch(() => chat.channels.length, () => !chat.activeId && sync())

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchOpen.value = !searchOpen.value
  }
}
onMounted(() => {
  sync()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="layout" :class="{ 'thread-open': !!chat.thread, 'nav-open': navOpen }">
    <ChannelSidebar class="left" @search="searchOpen = true" @create="createOpen = true" />
    <div class="scrim" @click="navOpen = false" />
    <MessagePane class="main" @search="searchOpen = true" @menu="navOpen = !navOpen" />
    <Transition name="swap" mode="out-in">
      <ThreadPanel v-if="chat.thread" :key="chat.thread.rootId" class="right" />
      <PresencePanel v-else class="right" />
    </Transition>
    <Transition name="modal">
      <SearchModal v-if="searchOpen" @close="searchOpen = false" />
    </Transition>
    <Transition name="modal">
      <CreateChannelModal v-if="createOpen" @close="createOpen = false" />
    </Transition>
    <Transition name="toast">
      <div v-if="chat.toast" class="toast" :class="chat.toast.kind">{{ chat.toast.text }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.layout {
  height: 100%; display: grid; grid-template-columns: 272px minmax(0, 1fr) 288px;
  background: var(--chrome);
}
.layout.thread-open { grid-template-columns: 272px minmax(0, 1fr) 400px; }
.main { min-width: 0; }
.scrim { display: none; }
.toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 60;
  background: var(--ink); color: #fff; padding: 10px 18px; border-radius: 14px; font-weight: 600; font-size: 14px;
  box-shadow: var(--shadow-lg);
}
.toast.error { background: var(--coral); }
.toast-enter-active { transition: all 0.4s var(--spring); }
.toast-leave-active { transition: all 0.2s var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 16px) scale(0.95); }
.swap-enter-active, .swap-leave-active { transition: opacity 0.15s, transform 0.2s var(--ease); }
.swap-enter-from, .swap-leave-to { opacity: 0; transform: translateX(12px); }

@media (max-width: 1180px) {
  .layout, .layout.thread-open { grid-template-columns: 248px minmax(0, 1fr); }
  .right { display: none; }
  .layout.thread-open .right { display: flex; position: fixed; inset: 0 0 0 auto; width: min(420px, 100%); z-index: 40; box-shadow: var(--shadow-lg); }
}
@media (max-width: 760px) {
  .layout, .layout.thread-open { grid-template-columns: minmax(0, 1fr); }
  .left { position: fixed; inset: 0 auto 0 0; width: min(300px, 86%); z-index: 50; transform: translateX(-105%); transition: transform 0.3s var(--ease); }
  .nav-open .left { transform: none; box-shadow: var(--shadow-lg); }
  .nav-open .scrim { display: block; position: fixed; inset: 0; background: rgba(27, 27, 47, 0.3); z-index: 45; }
}
</style>

<style>
.modal-enter-active { transition: opacity 0.18s var(--ease); }
.modal-leave-active { transition: opacity 0.12s var(--ease); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .sheet { transition: transform 0.32s var(--spring), opacity 0.18s; }
.modal-leave-active .sheet { transition: transform 0.12s var(--ease), opacity 0.12s; }
.modal-enter-from .sheet, .modal-leave-to .sheet { transform: translateY(-10px) scale(0.96); opacity: 0; }
</style>
