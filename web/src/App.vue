<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { session } from './lib/api'
import { useChat } from './stores/chat'
import LoginScreen from './components/LoginScreen.vue'
import ChatLayout from './components/ChatLayout.vue'

const chat = useChat()
const authed = ref(!!session.token)
const failed = ref(false)

async function start() {
  try {
    await chat.init()
  } catch {
    if (!session.token) authed.value = false
    else failed.value = true
  }
}

function onLogin() {
  authed.value = true
  start()
}

onMounted(() => authed.value && start())
</script>

<template>
  <LoginScreen v-if="!authed" @done="onLogin" />
  <ChatLayout v-else-if="chat.ready" />
  <div v-else class="splash">
    <img src="/favicon.svg" alt="" width="56" height="56" />
    <p v-if="failed">Couldn't reach the server. <button class="btn ghost" @click="start">Retry</button></p>
  </div>
</template>

<style scoped>
.splash { height: 100%; display: grid; place-content: center; justify-items: center; gap: 16px; color: var(--muted); }
.splash img { animation: breathe 1.4s var(--ease) infinite alternate; }
@keyframes breathe { to { transform: scale(1.12); } }
</style>
