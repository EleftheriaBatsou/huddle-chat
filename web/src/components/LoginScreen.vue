<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { User } from '@shared/types'
import { api, session } from '../lib/api'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

const emit = defineEmits<{ done: [] }>()
const people = ref<User[]>([])
const name = ref('')
const busy = ref(false)
const error = ref('')

onMounted(async () => {
  people.value = await api<User[]>('/api/auth/users').catch(() => [])
})

async function login(body: { name?: string; email?: string }) {
  busy.value = true
  error.value = ''
  try {
    const res = await api<{ token: string }>('/api/auth/login', { body })
    session.token = res.token
    emit('done')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="blob b1" /><div class="blob b2" /><div class="blob b3" />
    <div class="card">
      <div class="brand">
        <img src="/favicon.svg" alt="" width="44" height="44" />
        <div>
          <h1>Huddle</h1>
          <p>Channels, threads and presence — instantly.</p>
        </div>
      </div>

      <h2>Jump in as…</h2>
      <div class="people">
        <button v-for="u in people" :key="u.id" class="person" :disabled="busy" @click="login({ email: u.email })">
          <Avatar :user="u" :size="44" />
          <span>{{ u.name.split(' ')[0] }}</span>
        </button>
      </div>

      <div class="or"><span>or join with your own name</span></div>
      <form class="own" @submit.prevent="name.trim() && login({ name })">
        <input v-model="name" class="field" placeholder="Your name" maxlength="60" />
        <button class="btn" :disabled="busy || !name.trim()"><Icon name="logIn" style="width: 18px" /> Join</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <p class="hint">Tip: each browser tab keeps its own sign-in — open a second tab as someone else to watch messages, typing and presence travel live.</p>
    </div>
  </div>
</template>

<style scoped>
.login { position: relative; min-height: 100%; display: grid; place-items: center; padding: 24px 16px; overflow: hidden; }
.blob { position: absolute; border-radius: 50%; filter: blur(70px); opacity: 0.55; pointer-events: none; }
.b1 { width: 420px; height: 420px; background: var(--accent); top: -120px; left: -80px; }
.b2 { width: 360px; height: 360px; background: var(--teal); bottom: -120px; right: -60px; }
.b3 { width: 260px; height: 260px; background: var(--yellow); top: 40%; right: 20%; opacity: 0.35; }
.card {
  position: relative; width: min(520px, 100%); background: rgba(255, 255, 255, 0.86); backdrop-filter: blur(20px);
  border-radius: 24px; padding: 32px; box-shadow: var(--shadow-lg); animation: pop 0.5s var(--spring);
}
@keyframes pop { from { opacity: 0; transform: translateY(12px) scale(0.97); } }
.brand { display: flex; gap: 14px; align-items: center; margin-bottom: 28px; }
h1 { margin: 0; font-size: 28px; letter-spacing: -0.03em; }
.brand p { margin: 0; color: var(--muted); }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 12px; }
.people { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; }
.person {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px; border-radius: 14px;
  font-weight: 600; font-size: 13px; transition: background 0.15s, transform 0.3s var(--spring);
}
.person:hover { background: var(--accent-soft); transform: translateY(-3px); }
.or { display: flex; align-items: center; gap: 12px; margin: 22px 0 14px; color: var(--muted); font-size: 13px; }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line-2); }
.own { display: flex; gap: 8px; }
.own .btn { height: 44px; }
.error { color: var(--coral); font-weight: 600; margin: 10px 0 0; }
.hint { margin: 18px 0 0; font-size: 13px; color: var(--muted); }
</style>
