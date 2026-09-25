<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useChat } from '../stores/chat'
import { fileSize } from '../lib/format'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import EmojiPicker from './EmojiPicker.vue'

const props = withDefaults(defineProps<{ channelId: number; replyToId?: number | null; placeholder?: string }>(), { replyToId: null })
const chat = useChat()
const text = ref('')
const files = ref<{ file: File; url: string | null }[]>([])
const ta = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const picker = ref(false)
const mention = ref<{ start: number; query: string; index: number } | null>(null)
let lastTyping = 0

const canSend = computed(() => text.value.trim().length > 0 || files.value.length > 0)

const suggestions = computed(() => {
  if (!mention.value) return []
  const q = mention.value.query.toLowerCase()
  return [...chat.users.values()]
    .filter((u) => u.id !== chat.me?.id && u.name.toLowerCase().split(' ').some((p) => p.startsWith(q)))
    .slice(0, 6)
})

function autosize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 220)}px`
}

function onInput() {
  autosize()
  const now = Date.now()
  if (text.value && now - lastTyping > 2500) {
    lastTyping = now
    chat.typingPing(props.channelId)
  }
  // @mention autocomplete
  const el = ta.value!
  const upto = text.value.slice(0, el.selectionStart)
  const m = upto.match(/(?:^|\s)@([\p{L}\w]*)$/u)
  mention.value = m ? { start: upto.length - m[1]!.length - 1, query: m[1]!, index: 0 } : null
}

function applyMention(i: number) {
  const u = suggestions.value[i]
  if (!u || !mention.value) return
  const handle = `@${u.name.split(' ')[0]} `
  const el = ta.value!
  const end = el.selectionStart
  const caret = mention.value.start + handle.length
  text.value = text.value.slice(0, mention.value.start) + handle + text.value.slice(end)
  mention.value = null
  nextTick(() => {
    el.focus()
    el.setSelectionRange(caret, caret)
  })
}

function onKeydown(e: KeyboardEvent) {
  if (mention.value && suggestions.value.length) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = suggestions.value.length
      mention.value.index = (mention.value.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      applyMention(mention.value.index)
      return
    }
    if (e.key === 'Escape') {
      mention.value = null
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

function insert(s: string) {
  const el = ta.value!
  const start = el.selectionStart ?? text.value.length
  const end = el.selectionEnd ?? start
  text.value = text.value.slice(0, start) + s + text.value.slice(end)
  picker.value = false
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start + s.length, start + s.length)
    autosize()
  })
}

function addFiles(list: File[]) {
  for (const file of list.slice(0, 10 - files.value.length)) {
    if (file.size > 25 * 1024 * 1024) {
      chat.notify(`${file.name} is over 25 MB`, 'error')
      continue
    }
    files.value.push({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
  }
  ta.value?.focus()
}

function onPaste(e: ClipboardEvent) {
  const pasted = [...(e.clipboardData?.files ?? [])]
  if (pasted.length) {
    e.preventDefault()
    addFiles(pasted)
  }
}

function submit() {
  if (!canSend.value) return
  const body = text.value.trim()
  const outgoing = files.value.map((f) => f.file)
  text.value = ''
  files.value = []
  mention.value = null
  nextTick(autosize)
  chat.send(props.channelId, body, outgoing, props.replyToId)
}

watch(() => props.channelId, () => nextTick(() => ta.value?.focus()))
onMounted(() => ta.value?.focus())
defineExpose({ addFiles })
</script>

<template>
  <form class="composer" :class="{ thread: !!replyToId }" @submit.prevent="submit">
    <Transition name="pop">
      <ul v-if="mention && suggestions.length" class="mentions">
        <li v-for="(u, i) in suggestions" :key="u.id" :class="{ on: i === mention.index }" @mousedown.prevent="applyMention(i)">
          <Avatar :user="u" :size="24" :status="chat.presence[u.id] ?? 'offline'" /> {{ u.name }}
        </li>
      </ul>
    </Transition>

    <TransitionGroup v-if="files.length" name="file" tag="div" class="files">
      <div v-for="(f, i) in files" :key="f.file.name + i" class="file">
        <img v-if="f.url" :src="f.url" alt="" />
        <span v-else class="ficon"><Icon name="file" /></span>
        <span class="fname">{{ f.file.name }}<small>{{ fileSize(f.file.size) }}</small></span>
        <button type="button" class="rm" title="Remove" @click="files.splice(i, 1)"><Icon name="x" /></button>
      </div>
    </TransitionGroup>

    <textarea
      ref="ta"
      v-model="text"
      rows="1"
      :placeholder="placeholder ?? 'Write a message'"
      @input="onInput"
      @keydown="onKeydown"
      @paste="onPaste"
      @click="onInput"
    />
    <div class="tools">
      <button type="button" class="icon-btn" title="Attach files" @click="fileInput?.click()"><Icon name="paperclip" /></button>
      <div class="emoji-wrap">
        <button type="button" class="icon-btn" title="Emoji" @click="picker = !picker"><Icon name="smile" /></button>
        <Transition name="pop"><EmojiPicker v-if="picker" class="picker" @pick="insert" @close="picker = false" /></Transition>
      </div>
      <span class="hint"><b>**bold**</b> <i>_italic_</i> <code>`code`</code> · Shift+Enter for a new line</span>
      <button class="send" :disabled="!canSend" title="Send"><Icon name="send" /></button>
    </div>
    <input ref="fileInput" type="file" multiple hidden @change="addFiles([...(($event.target as HTMLInputElement).files ?? [])]); ($event.target as HTMLInputElement).value = ''" />
  </form>
</template>

<style scoped>
.composer {
  position: relative; border: 1.5px solid var(--line-2); border-radius: 18px; background: var(--surface);
  box-shadow: var(--shadow-sm); transition: border-color 0.15s, box-shadow 0.2s;
}
.composer:focus-within { border-color: #BFB0FF; box-shadow: 0 0 0 4px rgba(124, 92, 255, 0.1), var(--shadow); }
textarea { display: block; width: 100%; border: 0; outline: none; resize: none; background: transparent; padding: 12px 16px 4px; max-height: 220px; line-height: 1.5; }
.tools { display: flex; align-items: center; gap: 2px; padding: 4px 6px 6px 8px; }
.hint { flex: 1; font-size: 11.5px; color: var(--muted); padding-left: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hint code { font-size: 11px; }
.send {
  width: 38px; height: 34px; border-radius: 11px; display: grid; place-items: center; background: var(--accent); color: #fff;
  transition: transform 0.3s var(--spring), opacity 0.2s, background 0.15s;
}
.send svg { width: 17px; height: 17px; }
.send:hover { background: var(--accent-ink); }
.send:active { transform: scale(0.88) rotate(-8deg); }
.send:disabled { opacity: 0.35; background: var(--muted); }
.emoji-wrap { position: relative; }
.picker { position: absolute; bottom: 44px; left: 0; z-index: 30; transform-origin: bottom left; }
.files { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px 0; }
.file { position: relative; display: flex; align-items: center; gap: 8px; padding: 6px 30px 6px 6px; border-radius: 12px; background: var(--accent-softer); border: 1px solid var(--line-2); max-width: 240px; }
.file img, .ficon { width: 40px; height: 40px; border-radius: 9px; object-fit: cover; flex: none; }
.ficon { display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-ink); }
.ficon svg { width: 18px; }
.fname { font-size: 13px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; flex-direction: column; }
.fname small { color: var(--muted); font-weight: 500; }
.rm { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; color: var(--muted); }
.rm:hover { background: #FFE8ED; color: var(--coral); }
.rm svg { width: 14px; }
.file-enter-active { transition: all 0.35s var(--spring); }
.file-enter-from { opacity: 0; transform: scale(0.8); }
.mentions {
  position: absolute; bottom: calc(100% + 8px); left: 12px; z-index: 30; list-style: none; margin: 0; padding: 6px; min-width: 240px;
  background: var(--surface); border: 1px solid var(--line-2); border-radius: 14px; box-shadow: var(--shadow-lg);
}
.mentions li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer; }
.mentions li.on { background: var(--accent-soft); color: var(--accent-ink); }
.pop-enter-active { transition: all 0.28s var(--spring); }
.pop-leave-active { transition: all 0.1s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: scale(0.94) translateY(4px); }
@media (max-width: 760px) { .hint { visibility: hidden; } }
</style>
