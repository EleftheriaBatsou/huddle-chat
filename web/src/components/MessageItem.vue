<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useChat, type LocalMessage } from '../stores/chat'
import { renderMarkdown, mentionsMe } from '../lib/markdown'
import { relative, timeOf } from '../lib/format'
import { QUICK_REACTIONS } from '../lib/emoji'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'
import EmojiPicker from './EmojiPicker.vue'
import AttachmentView from './AttachmentView.vue'

const props = withDefaults(defineProps<{ m: LocalMessage; header: boolean; highlight?: boolean; inThread?: boolean }>(), { inThread: false })
const chat = useChat()
const user = computed(() => chat.users.get(props.m.userId) ?? null)
const mine = computed(() => props.m.userId === chat.me?.id)
const html = computed(() => (props.m.body ? renderMarkdown(props.m.body) : ''))
const mentioned = computed(() => !mine.value && mentionsMe(props.m.body))
// Only messages that just arrived animate in — not history loaded from the server.
const fresh = Date.now() - Date.parse(props.m.createdAt) < 8000
const picker = ref(false)
const editing = ref(false)
const draft = ref('')
const editor = ref<HTMLTextAreaElement | null>(null)

async function startEdit() {
  draft.value = props.m.body
  editing.value = true
  await nextTick()
  editor.value?.focus()
  editor.value?.setSelectionRange(draft.value.length, draft.value.length)
}
async function saveEdit() {
  const body = draft.value.trim()
  editing.value = false
  if (body && body !== props.m.body) await chat.edit(props.m.id, body).catch((e) => chat.notify(e.message, 'error'))
}
async function del() {
  if (confirm('Delete this message? This can’t be undone.')) await chat.remove(props.m.id).catch((e) => chat.notify(e.message, 'error'))
}
function react(emoji: string) {
  picker.value = false
  chat.react(props.m, emoji)
}
const reactedBy = (ids: number[]) => ids.map((id) => chat.userName(id).split(' ')[0]).join(', ')
</script>

<template>
  <div
    class="msg"
    :data-mid="m.id"
    :class="{ header, fresh, pending: m.pending, failed: m.failed, highlight, mentioned, deleted: m.deletedAt, 'in-thread': inThread }"
  >
    <div class="gutter">
      <Avatar v-if="header" :user="user" :size="38" />
      <span v-else class="hover-time">{{ timeOf(m.createdAt) }}</span>
    </div>
    <div class="content">
      <div v-if="header" class="meta">
        <strong>{{ user?.name ?? 'Unknown' }}</strong>
        <time :title="new Date(m.createdAt).toLocaleString()">{{ timeOf(m.createdAt) }}</time>
      </div>

      <p v-if="m.deletedAt" class="gone">This message was deleted.</p>
      <div v-else-if="editing" class="edit">
        <textarea
          ref="editor"
          v-model="draft"
          rows="2"
          @keydown.enter.exact.prevent="saveEdit"
          @keydown.esc.prevent="editing = false"
        />
        <div class="edit-hint">Enter to save · Esc to cancel</div>
      </div>
      <div v-else-if="m.body" class="md body">
        <span v-html="html" /><span v-if="m.editedAt" class="edited">(edited)</span>
      </div>

      <div v-if="m.localFiles?.length && !m.attachments.length" class="atts">
        <AttachmentView v-for="(f, i) in m.localFiles" :key="i" :local="f" />
      </div>
      <div v-else-if="m.attachments.length" class="atts">
        <AttachmentView v-for="a in m.attachments" :key="a.id" :attachment="a" />
      </div>

      <div v-if="m.reactions.length" class="reactions">
        <TransitionGroup name="chip">
          <button
            v-for="r in m.reactions"
            :key="r.emoji"
            class="chip"
            :class="{ on: chat.me && r.userIds.includes(chat.me.id) }"
            :title="reactedBy(r.userIds)"
            @click="react(r.emoji)"
          >
            <span class="e">{{ r.emoji }}</span><span class="n">{{ r.count }}</span>
          </button>
        </TransitionGroup>
        <button class="chip add" title="Add reaction" @click="picker = !picker"><Icon name="smile" /></button>
      </div>

      <button v-if="!inThread && m.replyCount > 0" class="thread-link" @click="chat.openThread(m.id)">
        <span class="faces">
          <Avatar v-for="uid in m.replyUserIds.slice(0, 3)" :key="uid" :user="chat.users.get(uid)" :size="22" />
        </span>
        <strong>{{ m.replyCount }} {{ m.replyCount === 1 ? 'reply' : 'replies' }}</strong>
        <span v-if="m.lastReplyAt" class="last">Last reply {{ relative(m.lastReplyAt) }}</span>
      </button>

      <div v-if="m.pending" class="status">Sending…</div>
      <div v-else-if="m.failed" class="status fail">
        <Icon name="alert" /> {{ m.failed }}
        <button @click="m.retry?.()">Retry</button>
        <button @click="chat.discardFailed(m)">Discard</button>
      </div>
    </div>

    <div v-if="!m.deletedAt && m.id > 0 && !editing" class="actions" :class="{ open: picker }">
      <button v-for="e in QUICK_REACTIONS.slice(0, 3)" :key="e" class="icon-btn q" :title="`React ${e}`" @click="react(e)">{{ e }}</button>
      <button class="icon-btn" title="Add reaction" @click="picker = !picker"><Icon name="smile" /></button>
      <button v-if="!inThread && !m.replyToId" class="icon-btn" title="Reply in thread" @click="chat.openThread(m.id)"><Icon name="reply" /></button>
      <button v-if="mine" class="icon-btn" title="Edit" @click="startEdit"><Icon name="edit" /></button>
      <button v-if="mine" class="icon-btn danger" title="Delete" @click="del"><Icon name="trash" /></button>
    </div>
    <Transition name="pop">
      <EmojiPicker v-if="picker" class="picker" @pick="react" @close="picker = false" />
    </Transition>
  </div>
</template>

<style scoped>
.msg {
  position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 0 8px;
  padding: 2px 20px 2px 16px; transition: background 0.2s;
}
.msg.header { margin-top: 10px; padding-top: 6px; }
.msg:hover { background: #FAF9FF; }
.msg.fresh { animation: slide-in 0.32s var(--ease); }
@keyframes slide-in { from { opacity: 0; transform: translateY(8px); } }
.msg.pending .body { opacity: 0.55; }
.msg.failed .body { opacity: 0.7; }
.msg.mentioned { background: #FFF6F8; box-shadow: inset 3px 0 0 var(--coral); }
.msg.highlight { animation: flash 2.6s var(--ease); }
@keyframes flash { 0%, 40% { background: #FFF1C2; } 100% { background: transparent; } }
.gutter { display: flex; justify-content: center; padding-top: 2px; }
.hover-time { font-size: 11px; color: var(--muted); opacity: 0; padding-top: 3px; font-variant-numeric: tabular-nums; }
.msg:hover .hover-time { opacity: 1; }
.content { min-width: 0; }
.meta { display: flex; align-items: baseline; gap: 8px; line-height: 1.3; }
.meta strong { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
.meta time { font-size: 12px; color: var(--muted); }
.body { color: var(--ink); overflow-wrap: anywhere; }
.body > span:first-child :deep(p:last-child) { display: inline; }
.edited { font-size: 12px; color: var(--muted); margin-left: 4px; }
.gone { margin: 0; font-style: italic; color: var(--muted); }
.edit textarea { width: 100%; resize: vertical; border: 1.5px solid var(--accent); border-radius: 12px; padding: 8px 12px; outline: none; box-shadow: 0 0 0 4px rgba(124, 92, 255, 0.12); }
.edit-hint { font-size: 12px; color: var(--muted); margin-top: 2px; }
.atts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.reactions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: 999px;
  background: #F4F3FA; border: 1.5px solid transparent; font-size: 13px; font-weight: 700; color: var(--ink-2);
  transition: transform 0.3s var(--spring), background 0.15s, border-color 0.15s;
}
.chip:hover { transform: translateY(-1px) scale(1.04); background: #EEEBFA; }
.chip:active { transform: scale(0.9); }
.chip.on { background: var(--accent-soft); border-color: #C8BBFF; color: var(--accent-ink); }
.chip .e { font-size: 15px; }
.chip.add { opacity: 0; width: 34px; padding: 0; justify-content: center; }
.chip.add svg { width: 15px; height: 15px; }
.msg:hover .chip.add { opacity: 1; }
.chip-enter-active { transition: transform 0.4s var(--spring); }
.chip-enter-from { transform: scale(0.3); }
.thread-link {
  display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; padding: 4px 10px 4px 4px; border-radius: 12px;
  font-size: 13px; color: var(--accent-ink); border: 1px solid transparent; transition: background 0.15s, border-color 0.15s;
}
.thread-link:hover { background: var(--surface); border-color: var(--line-2); box-shadow: var(--shadow-sm); }
.faces { display: inline-flex; }
.faces > * + * { margin-left: -6px; }
.faces :deep(.avatar) { box-shadow: 0 0 0 2px var(--surface); }
.last { color: var(--muted); font-weight: 500; }
.status { font-size: 12px; color: var(--muted); margin-top: 2px; }
.status.fail { display: flex; align-items: center; gap: 6px; color: var(--coral); font-weight: 600; }
.status.fail svg { width: 14px; height: 14px; }
.status.fail button { color: var(--accent-ink); font-weight: 700; text-decoration: underline; }
.actions {
  position: absolute; top: -16px; right: 20px; z-index: 4; display: flex; gap: 2px; padding: 3px;
  background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; box-shadow: var(--shadow);
  opacity: 0; transform: translateY(4px) scale(0.96); pointer-events: none;
  transition: opacity 0.15s 0.15s, transform 0.25s var(--spring) 0.15s;
}
.msg:hover .actions, .actions.open { opacity: 1; transform: none; pointer-events: auto; transition-delay: 0s; }
.actions .icon-btn { width: 30px; height: 30px; }
.actions .q { font-size: 16px; }
.actions .danger:hover { background: #FFE8ED; color: var(--coral); }
.picker { position: absolute; right: 20px; top: 22px; z-index: 20; }
.pop-enter-active { transition: all 0.28s var(--spring); }
.pop-leave-active { transition: all 0.1s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: scale(0.92) translateY(-4px); }
.in-thread { padding-left: 8px; padding-right: 12px; grid-template-columns: 44px minmax(0, 1fr); }
.in-thread .actions { right: 12px; }
</style>
