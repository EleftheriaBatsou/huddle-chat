<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChat } from '../stores/chat'
import MessageList from './MessageList.vue'
import Composer from './Composer.vue'
import TypingIndicator from './TypingIndicator.vue'
import Icon from './Icon.vue'

defineEmits<{ search: []; menu: [] }>()
const chat = useChat()
const composer = ref<InstanceType<typeof Composer> | null>(null)
const dragging = ref(0)
const ch = computed(() => chat.active)

function onDrop(e: DragEvent) {
  dragging.value = 0
  const files = [...(e.dataTransfer?.files ?? [])]
  if (files.length && ch.value?.isMember) composer.value?.addFiles(files)
}
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')
</script>

<template>
  <main
    class="pane"
    @dragenter.prevent="hasFiles($event) && dragging++"
    @dragleave="dragging = Math.max(0, dragging - 1)"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <header class="head" v-if="ch">
      <button class="icon-btn menu" @click="$emit('menu')"><Icon name="menu" /></button>
      <div class="title">
        <h2><Icon :name="ch.isPrivate ? 'lock' : 'hash'" class="h-glyph" />{{ ch.name }}</h2>
        <p v-if="ch.topic">{{ ch.topic }}</p>
      </div>
      <div class="meta">
        <span class="instance" :title="`Your WebSocket is served by app instance ${chat.socketInstance}. Messages from other instances arrive via Valkey pub/sub.`">
          <Icon name="zap" /> {{ chat.socketInstance || '…' }}
        </span>
        <span class="members"><Icon name="users" /> {{ ch.memberCount }}</span>
        <button class="icon-btn" title="Search (⌘K)" @click="$emit('search')"><Icon name="search" /></button>
      </div>
    </header>

    <MessageList v-if="ch" :key="ch.id" :channel-id="ch.id" />

    <div class="bottom" v-if="ch">
      <TypingIndicator :channel-id="ch.id" />
      <Composer v-if="ch.isMember" ref="composer" :channel-id="ch.id" :placeholder="`Message #${ch.name}`" />
      <div v-else class="join-bar">
        <span>You're previewing <strong>#{{ ch.name }}</strong></span>
        <button class="btn" @click="chat.joinChannel(ch.id)">Join channel</button>
      </div>
    </div>

    <Transition name="drop">
      <div v-if="dragging && ch?.isMember" class="dropzone">
        <div><Icon name="image" /><strong>Drop to share in #{{ ch.name }}</strong><span>Uploads go straight to object storage</span></div>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.pane { position: relative; display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--surface); }
.head { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--line); min-height: 68px; }
.menu { display: none; }
.title { flex: 1; min-width: 0; }
h2 { margin: 0; font-size: 18px; letter-spacing: -0.02em; display: flex; align-items: center; gap: 4px; }
.h-glyph { width: 18px; height: 18px; color: var(--muted); }
.title p { margin: 0; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; font-weight: 600; }
.meta svg { width: 15px; height: 15px; }
.members, .instance { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: var(--accent-softer); }
.instance { color: var(--accent-ink); font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.bottom { padding: 0 20px 18px; }
.join-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: var(--radius); background: var(--accent-softer); border: 1px dashed #CFC5FF; }
.dropzone { position: absolute; inset: 10px; border-radius: 20px; border: 2.5px dashed var(--accent); background: rgba(247, 245, 255, 0.92); display: grid; place-items: center; z-index: 10; pointer-events: none; }
.dropzone div { display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--accent-ink); }
.dropzone svg { width: 40px; height: 40px; }
.dropzone span { color: var(--muted); font-size: 13px; }
.drop-enter-active { transition: all 0.25s var(--spring); }
.drop-leave-active { transition: all 0.12s; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: scale(0.98); }
@media (max-width: 760px) {
  .menu { display: inline-grid; }
  .head { padding: 10px 12px; }
  .bottom { padding: 0 12px 12px; }
  .members, .instance { display: none; }
}
</style>
