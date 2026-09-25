<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { EMOJI_GROUPS } from '../lib/emoji'

const emit = defineEmits<{ pick: [emoji: string]; close: [] }>()
const root = ref<HTMLElement | null>(null)
const onDoc = (e: PointerEvent) => root.value && !root.value.contains(e.target as Node) && emit('close')
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close')
onMounted(() => {
  setTimeout(() => document.addEventListener('pointerdown', onDoc), 0)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDoc)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="picker scroll" @click.stop>
    <section v-for="g in EMOJI_GROUPS" :key="g.label">
      <h4>{{ g.label }}</h4>
      <div class="grid">
        <button v-for="e in g.emojis" :key="e" type="button" @click="emit('pick', e)">{{ e }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.picker {
  width: 312px; max-width: calc(100vw - 32px); max-height: 300px; padding: 8px 10px 10px; background: var(--surface);
  border: 1px solid var(--line-2); border-radius: var(--radius); box-shadow: var(--shadow-lg); transform-origin: top right;
}
h4 { margin: 6px 4px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(8, 1fr); }
.grid button { height: 34px; border-radius: 9px; font-size: 20px; transition: transform 0.25s var(--spring), background 0.1s; }
.grid button:hover { background: var(--accent-soft); transform: scale(1.22); }
@media (max-width: 360px) { .grid { grid-template-columns: repeat(7, 1fr); } }
</style>
