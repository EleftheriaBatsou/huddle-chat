<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChat } from '../stores/chat'
import MessageItem from './MessageItem.vue'
import Composer from './Composer.vue'
import Icon from './Icon.vue'

const chat = useChat()
const t = computed(() => chat.thread!)
const channel = computed(() => (t.value.root ? chat.channelById(t.value.root.channelId) : null))
const list = ref<HTMLElement | null>(null)
const replies = computed(() => t.value.replies)

watch(() => replies.value.length, async () => {
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' })
})
</script>

<template>
  <aside class="thread">
    <header>
      <div>
        <h3>Thread</h3>
        <span v-if="channel">#{{ channel.name }}</span>
      </div>
      <button class="icon-btn" title="Close thread" @click="chat.closeThread()"><Icon name="x" /></button>
    </header>
    <div ref="list" class="scroll body">
      <MessageItem v-if="t.root" :m="t.root" header in-thread :highlight="chat.highlightId === t.root.id" />
      <div class="divider" v-if="t.root">
        <span>{{ replies.length }} {{ replies.length === 1 ? 'reply' : 'replies' }}</span>
      </div>
      <div v-if="t.loading" class="loading">Loading replies…</div>
      <MessageItem
        v-for="(r, i) in replies"
        :key="r.clientId ?? r.id"
        :m="r"
        :header="i === 0 || replies[i - 1]!.userId !== r.userId"
        :highlight="chat.highlightId === r.id"
        in-thread
      />
    </div>
    <div class="compose" v-if="t.root && channel?.isMember">
      <Composer :channel-id="t.root.channelId" :reply-to-id="t.rootId" placeholder="Reply in thread…" />
    </div>
  </aside>
</template>

<style scoped>
.thread { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--surface); border-left: 1px solid var(--line); }
header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--line); min-height: 68px; }
h3 { margin: 0; font-size: 17px; }
header span { font-size: 12.5px; color: var(--muted); }
.body { flex: 1; min-height: 0; padding-bottom: 12px; }
.divider { display: flex; align-items: center; gap: 10px; margin: 10px 16px; font-size: 12px; font-weight: 700; color: var(--muted); }
.divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.loading { padding: 12px 18px; color: var(--muted); font-size: 13px; }
.compose { padding: 0 12px 14px; }
</style>
