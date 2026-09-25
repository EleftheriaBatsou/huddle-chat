<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { SearchResult } from '@shared/types'
import { api } from '../lib/api'
import { useChat } from '../stores/chat'
import { relative, snippetHtml } from '../lib/format'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

const emit = defineEmits<{ close: [] }>()
const chat = useChat()
const router = useRouter()
const q = ref('')
const scope = ref<'all' | 'here'>('all')
const res = ref<SearchResult | null>(null)
const loading = ref(false)
const sel = ref(0)
const input = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
let timer: number | undefined
let ctrl: AbortController | null = null

async function run() {
  const query = q.value.trim()
  ctrl?.abort()
  if (!query) {
    res.value = null
    loading.value = false
    return
  }
  ctrl = new AbortController()
  loading.value = true
  try {
    const params = new URLSearchParams({ q: query })
    if (scope.value === 'here' && chat.activeId) params.set('channelId', String(chat.activeId))
    res.value = await api<SearchResult>(`/api/search?${params}`, { signal: ctrl.signal })
    sel.value = 0
  } catch (e) {
    if ((e as Error).name !== 'AbortError') chat.notify((e as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

watch([q, scope], () => {
  clearTimeout(timer)
  timer = window.setTimeout(run, 90)
})

const hits = computed(() => res.value?.hits ?? [])

function open(i: number) {
  const h = hits.value[i]
  if (!h) return
  const ch = chat.channelById(h.channelId)
  if (!ch) return
  emit('close')
  router.push({ path: `/c/${ch.slug}`, query: { m: String(h.id) } })
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    sel.value = Math.min(sel.value + 1, hits.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    sel.value = Math.max(sel.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    open(sel.value)
  }
}
watch(sel, (i) => listEl.value?.children[i]?.scrollIntoView({ block: 'nearest' }))
onMounted(() => input.value?.focus())
const examples = ['deploy', 'croisant', 'search engine', 'pizza', 'presence ttl']
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div class="sheet" role="dialog" aria-label="Search messages" @keydown="onKey">
      <div class="bar">
        <Icon name="search" class="lens" />
        <input ref="input" v-model="q" placeholder="Search every channel you can see…" spellcheck="false" />
        <span v-if="loading" class="spin" />
        <span class="kbd">esc</span>
      </div>
      <div class="scopes">
        <button :class="{ on: scope === 'all' }" @click="scope = 'all'">All channels</button>
        <button v-if="chat.active" :class="{ on: scope === 'here' }" @click="scope = 'here'">#{{ chat.active.name }}</button>
        <span v-if="res" class="stats">{{ res.estimatedTotal }} result{{ res.estimatedTotal === 1 ? '' : 's' }} · {{ res.tookMs }} ms · {{ res.engine === 'meilisearch' ? 'Meilisearch' : 'Postgres' }}</span>
      </div>

      <ul v-if="hits.length" ref="listEl" class="scroll results">
        <li v-for="(h, i) in hits" :key="h.id" :class="{ on: i === sel }" @mousemove="sel = i" @click="open(i)">
          <Avatar :user="chat.users.get(h.userId)" :size="34" />
          <div class="hit">
            <div class="hit-meta">
              <strong>{{ chat.userName(h.userId) }}</strong>
              <span>#{{ chat.channelById(h.channelId)?.name }}</span>
              <span>· {{ relative(h.createdAt) }}</span>
            </div>
            <p v-html="snippetHtml(h.snippet)" />
          </div>
          <Icon name="enter" class="go" />
        </li>
      </ul>
      <div v-else-if="res && q.trim()" class="empty">No messages match “{{ q }}”.</div>
      <div v-else class="empty tips">
        <p>Typo-tolerant, instant search across your channels. Try:</p>
        <div class="examples"><button v-for="e in examples" :key="e" @click="q = e">{{ e }}</button></div>
      </div>
      <footer><span><span class="kbd">↑</span><span class="kbd">↓</span> navigate</span><span><span class="kbd">↵</span> jump to message</span></footer>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 70; background: rgba(27, 27, 47, 0.28); backdrop-filter: blur(6px); display: flex; justify-content: center; align-items: flex-start; padding: 10vh 16px 16px; }
.sheet { width: min(680px, 100%); max-height: 76vh; display: flex; flex-direction: column; background: var(--surface); border-radius: 22px; box-shadow: var(--shadow-lg); overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.7); }
.bar { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; }
.lens { width: 22px; height: 22px; color: var(--accent); flex: none; }
.bar input { flex: 1; border: 0; outline: none; font-size: 19px; font-weight: 600; background: transparent; min-width: 0; }
.bar input::placeholder { color: #B5B3C9; font-weight: 500; }
.spin { width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid var(--accent-soft); border-top-color: var(--accent); animation: rot 0.6s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }
.scopes { display: flex; align-items: center; gap: 6px; padding: 0 20px 12px; border-bottom: 1px solid var(--line); }
.scopes button { padding: 4px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 700; color: var(--ink-2); background: #F4F3FA; transition: all 0.2s var(--spring); }
.scopes button.on { background: var(--accent); color: #fff; }
.stats { margin-left: auto; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.results { list-style: none; margin: 0; padding: 8px; flex: 1; min-height: 0; }
.results li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 14px; cursor: pointer; transition: background 0.1s; }
.results li.on { background: var(--accent-softer); box-shadow: inset 0 0 0 1.5px #DDD4FF; }
.hit { flex: 1; min-width: 0; }
.hit-meta { display: flex; gap: 6px; font-size: 12.5px; color: var(--muted); }
.hit-meta strong { color: var(--ink); font-size: 13.5px; }
.hit p { margin: 2px 0 0; font-size: 14px; color: var(--ink-2); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.go { width: 16px; height: 16px; color: var(--accent); opacity: 0; align-self: center; transition: opacity 0.1s, transform 0.25s var(--spring); transform: translateX(-4px); }
li.on .go { opacity: 1; transform: none; }
.empty { padding: 28px 22px; color: var(--muted); font-size: 14px; }
.tips p { margin: 0 0 10px; }
.examples { display: flex; flex-wrap: wrap; gap: 8px; }
.examples button { padding: 6px 12px; border-radius: 999px; border: 1px dashed #CFC5FF; color: var(--accent-ink); font-weight: 600; font-size: 13px; transition: transform 0.25s var(--spring), background 0.15s; }
.examples button:hover { background: var(--accent-soft); transform: translateY(-1px); }
footer { display: flex; gap: 16px; padding: 10px 20px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); background: var(--chrome); }
footer > span { display: inline-flex; align-items: center; gap: 4px; }
</style>
