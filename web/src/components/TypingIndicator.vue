<script setup lang="ts">
import { computed } from 'vue'
import { useChat } from '../stores/chat'

const props = defineProps<{ channelId: number }>()
const chat = useChat()
const names = computed(() => chat.typingIn(props.channelId).map((id) => chat.userName(id).split(' ')[0]))
const label = computed(() => {
  const n = names.value
  if (!n.length) return ''
  if (n.length === 1) return `${n[0]} is typing`
  if (n.length === 2) return `${n[0]} and ${n[1]} are typing`
  return 'Several people are typing'
})
</script>

<template>
  <div class="typing" aria-live="polite">
    <Transition name="t">
      <span v-if="label" class="bubble">
        <span class="dots"><i /><i /><i /></span>
        <span><strong>{{ label }}</strong>…</span>
      </span>
    </Transition>
  </div>
</template>

<style scoped>
.typing { height: 26px; display: flex; align-items: center; padding: 0 4px; font-size: 12.5px; color: var(--ink-2); }
.bubble { display: inline-flex; align-items: center; gap: 8px; }
.bubble strong { font-weight: 700; }
.dots { display: inline-flex; gap: 3px; padding: 5px 7px; background: var(--accent-soft); border-radius: 999px; }
.dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: hop 1.2s infinite var(--ease); }
.dots i:nth-child(2) { animation-delay: 0.15s; }
.dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes hop { 0%, 60%, 100% { transform: translateY(0); opacity: 0.45; } 30% { transform: translateY(-4px); opacity: 1; } }
.t-enter-active { transition: all 0.3s var(--spring); }
.t-leave-active { transition: all 0.15s; }
.t-enter-from, .t-leave-to { opacity: 0; transform: translateY(6px); }
</style>
