<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useChat, type LocalMessage } from '../stores/chat'
import { dayLabel } from '../lib/format'
import MessageItem from './MessageItem.vue'
import Icon from './Icon.vue'

const props = defineProps<{ channelId: number }>()
const chat = useChat()
const el = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const view = computed(() => chat.views.get(props.channelId))
const atBottom = ref(true)
const newBelow = ref(0)

interface Row {
  m: LocalMessage
  header: boolean
  day: string | null
  unreadMark: boolean
}

// Sections per day so each sticky day pill is only sticky within its own day (the next one pushes it out).
const days = computed(() => {
  const out: { label: string; key: string; rows: Row[] }[] = []
  for (const r of rows.value) {
    if (r.day || !out.length) out.push({ label: r.day ?? '', key: `${r.m.createdAt.slice(0, 10)}-${r.m.id}`, rows: [] })
    out[out.length - 1]!.rows.push(r)
  }
  return out
})

// Group consecutive messages by the same author (within 5 minutes) under one header; insert day dividers.
const rows = computed<Row[]>(() => {
  const list = (view.value?.messages ?? []).filter((m) => !m.deletedAt || m.replyCount > 0)
  const unreadFrom = view.value?.unreadFrom ?? 0
  let markPlaced = false
  return list.map((m, i) => {
    const prev = list[i - 1]
    const day = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString() ? dayLabel(m.createdAt) : null
    const unreadMark = !markPlaced && unreadFrom > 0 && m.id > unreadFrom && m.userId !== chat.me?.id && !!prev
    if (unreadMark) markPlaced = true
    const header = !prev || !!day || unreadMark || prev.userId !== m.userId || !!prev.deletedAt ||
      Date.parse(m.createdAt) - Date.parse(prev.createdAt) > 5 * 60_000
    return { m, header, day, unreadMark }
  })
})

// ---- scroll anchoring ----
// flush: 'pre' watchers run after the data changed but BEFORE the DOM is patched, so the old
// scroll metrics are still measurable; the correction is applied once the new DOM is in place.
watch(
  () => view.value?.messages[0]?.id,
  (now, before) => {
    const e = el.value
    const v = view.value
    if (!e || !v || before == null || now === before || !v.messages.some((m) => m.id === before)) return
    const h = e.scrollHeight
    const t = e.scrollTop
    nextTick(() => {
      e.scrollTop = t + (e.scrollHeight - h)
      maybeLoadMore()
    })
  },
  { flush: 'pre' },
)

watch(
  () => view.value?.messages.at(-1)?.id,
  (now, before) => {
    const e = el.value
    const last = view.value?.messages.at(-1)
    if (!e || !last || now === before || before == null) return
    const wasBottom = e.scrollHeight - e.scrollTop - e.clientHeight < 140
    const mine = last.userId === chat.me?.id
    nextTick(() => {
      if (wasBottom || mine) scrollToBottom(true)
      else if (!view.value?.hasNewer) newBelow.value++
    })
  },
  { flush: 'pre' },
)

/** Near either edge with more history available? Fetch it — covers short pages where no scroll event fires. */
function maybeLoadMore() {
  const e = el.value
  const v = view.value
  if (!e || !v || v.loading) return
  if (e.scrollTop < 400 && v.hasOlder) chat.loadOlder(props.channelId)
  else if (e.scrollHeight - e.scrollTop - e.clientHeight < 140 && v.hasNewer) chat.loadNewer(props.channelId)
}

function scrollToBottom(smooth = false) {
  const e = el.value
  if (!e) return
  e.scrollTo({ top: e.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  newBelow.value = 0
}

function onScroll() {
  const e = el.value
  if (!e || !view.value) return
  atBottom.value = e.scrollHeight - e.scrollTop - e.clientHeight < 140
  if (atBottom.value) {
    newBelow.value = 0
    if (!view.value.hasNewer) chat.markRead(props.channelId)
  }
  maybeLoadMore()
}

async function focusHighlight() {
  await nextTick()
  const target = chat.highlightId && el.value?.querySelector(`[data-mid="${chat.highlightId}"]`)
  if (target) target.scrollIntoView({ block: 'center' })
  else scrollToBottom()
}

async function latest() {
  if (view.value?.hasNewer) await chat.jumpToLatest()
  await nextTick()
  scrollToBottom(true)
}

// Late layout changes (images decoding, thumbnails arriving) must not un-stick a reader who is at the bottom.
let ro: ResizeObserver | null = null
let io: IntersectionObserver | null = null
const topSentinel = ref<HTMLElement | null>(null)
onMounted(() => {
  focusHighlight()
  ro = new ResizeObserver(() => {
    if (atBottom.value && !chat.highlightId && el.value) el.value.scrollTop = el.value.scrollHeight
  })
  if (inner.value) ro.observe(inner.value)
  // Sentinel-based trigger: fires even when the list is already pinned at scrollTop 0.
  io = new IntersectionObserver((entries) => entries.some((x) => x.isIntersecting) && maybeLoadMore(), {
    root: el.value,
    rootMargin: '400px 0px 0px 0px',
  })
  if (topSentinel.value) io.observe(topSentinel.value)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  io?.disconnect()
})
watch(() => view.value?.loading, (now) => !now && nextTick(maybeLoadMore))
watch(() => chat.highlightId, (id) => id && focusHighlight())
watch(() => view.value?.loading, (now, before) => before === 'initial' && !now && focusHighlight())
</script>

<template>
  <div class="wrap">
    <div ref="el" class="scroll list msg-scroll" @scroll.passive="onScroll">
      <div ref="inner">
      <div ref="topSentinel" class="top">
        <div v-if="view?.loading === 'older' || view?.loading === 'initial'" class="loader"><i /><i /><i /></div>
        <div v-else-if="view && !view.hasOlder && view.messages.length" class="start">
          <div class="start-badge">#</div>
          <h3>This is the very beginning of #{{ chat.channelById(channelId)?.name }}</h3>
          <p>{{ chat.channelById(channelId)?.topic }}</p>
        </div>
      </div>
      <section v-for="d in days" :key="d.key" class="day-group">
        <div v-if="d.label" class="day"><span>{{ d.label }}</span></div>
        <template v-for="r in d.rows" :key="r.m.clientId ?? r.m.id">
          <div v-if="r.unreadMark" class="unread-mark"><span>New</span></div>
          <MessageItem :m="r.m" :header="r.header" :highlight="chat.highlightId === r.m.id" />
        </template>
      </section>
      <div v-if="view?.loading === 'newer'" class="loader"><i /><i /><i /></div>
      <div class="spacer" />
      </div>
    </div>
    <Transition name="pill">
      <button v-if="newBelow || view?.hasNewer || !atBottom" class="pill" :class="{ loud: newBelow }" @click="latest">
        <Icon name="arrowDown" />
        {{ newBelow ? `${newBelow} new message${newBelow > 1 ? 's' : ''}` : 'Jump to latest' }}
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.wrap { position: relative; flex: 1; min-height: 0; display: flex; }
.list { flex: 1; padding: 8px 0 0; overflow-anchor: none; }
.top { min-height: 24px; }
.start { padding: 36px 24px 12px; }
.start-badge { width: 56px; height: 56px; border-radius: 18px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-size: 28px; font-weight: 800; margin-bottom: 12px; }
.start h3 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
.start p { margin: 4px 0 0; color: var(--muted); }
.day { position: sticky; top: 6px; z-index: 2; display: flex; justify-content: center; margin: 14px 0 6px; pointer-events: none; }
.day span { background: var(--surface); border: 1px solid var(--line-2); padding: 3px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--ink-2); box-shadow: var(--shadow-sm); }
.unread-mark { display: flex; align-items: center; gap: 8px; margin: 8px 20px; color: var(--coral); font-size: 12px; font-weight: 800; }
.unread-mark::before { content: ''; flex: 1; height: 1.5px; background: var(--coral); opacity: 0.5; }
.unread-mark span { order: 2; }
.unread-mark::after { content: ''; order: 1; width: 0; }
.spacer { height: 12px; }
.loader { display: flex; justify-content: center; gap: 6px; padding: 16px; }
.loader i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: bounce 0.9s infinite var(--ease); }
.loader i:nth-child(2) { animation-delay: 0.12s; }
.loader i:nth-child(3) { animation-delay: 0.24s; }
@keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-6px); opacity: 1; } }
.pill {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 3;
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px;
  background: var(--surface); color: var(--ink-2); font-weight: 700; font-size: 13px; box-shadow: var(--shadow);
  border: 1px solid var(--line-2);
}
.pill.loud { background: var(--accent); color: #fff; border-color: transparent; }
.pill svg { width: 15px; height: 15px; }
.pill-enter-active { transition: all 0.35s var(--spring); }
.pill-leave-active { transition: all 0.15s; }
.pill-enter-from, .pill-leave-to { opacity: 0; transform: translate(-50%, 10px) scale(0.9); }
</style>
