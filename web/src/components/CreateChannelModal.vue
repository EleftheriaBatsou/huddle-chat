<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChat } from '../stores/chat'
import Icon from './Icon.vue'

const emit = defineEmits<{ close: [] }>()
const chat = useChat()
const router = useRouter()
const name = ref('')
const topic = ref('')
const isPrivate = ref(false)
const busy = ref(false)
const error = ref('')
const input = ref<HTMLInputElement | null>(null)
onMounted(() => input.value?.focus())

async function create() {
  busy.value = true
  error.value = ''
  try {
    const ch = await chat.createChannel(name.value, topic.value, isPrivate.value)
    emit('close')
    router.push(`/c/${ch.slug}`)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')" @keydown.esc="emit('close')">
    <form class="sheet" @submit.prevent="create">
      <header>
        <h3>Create a channel</h3>
        <button type="button" class="icon-btn" @click="emit('close')"><Icon name="x" /></button>
      </header>
      <label>Name
        <div class="prefixed"><span>{{ isPrivate ? '🔒' : '#' }}</span><input ref="input" v-model="name" class="field" placeholder="e.g. launch-party" maxlength="40" /></div>
      </label>
      <label>Topic <small>(optional)</small>
        <input v-model="topic" class="field" placeholder="What's it about?" maxlength="200" />
      </label>
      <label class="toggle">
        <input v-model="isPrivate" type="checkbox" />
        <span class="switch" />
        <span><strong>Private</strong><small>Only invited members can see it</small></span>
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <footer>
        <button type="button" class="btn ghost" @click="emit('close')">Cancel</button>
        <button class="btn" :disabled="busy || !name.trim()">Create</button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 70; background: rgba(27, 27, 47, 0.28); backdrop-filter: blur(6px); display: grid; place-items: center; padding: 16px; }
.sheet { width: min(460px, 100%); background: var(--surface); border-radius: 22px; box-shadow: var(--shadow-lg); padding: 22px; display: flex; flex-direction: column; gap: 14px; }
header { display: flex; align-items: center; justify-content: space-between; }
h3 { margin: 0; font-size: 19px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; color: var(--ink-2); }
small { color: var(--muted); font-weight: 500; }
.prefixed { position: relative; }
.prefixed span { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--muted); font-weight: 700; }
.prefixed .field { padding-left: 34px; }
.toggle { flex-direction: row; align-items: center; gap: 12px; cursor: pointer; }
.toggle input { display: none; }
.toggle > span:last-child { display: flex; flex-direction: column; }
.switch { width: 42px; height: 24px; border-radius: 999px; background: var(--line-2); position: relative; transition: background 0.2s; flex: none; }
.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-sm); transition: transform 0.35s var(--spring); }
.toggle input:checked + .switch { background: var(--accent); }
.toggle input:checked + .switch::after { transform: translateX(18px); }
.error { margin: 0; color: var(--coral); font-weight: 600; font-size: 14px; }
footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
</style>
