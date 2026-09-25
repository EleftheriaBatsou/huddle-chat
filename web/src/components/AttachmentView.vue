<script setup lang="ts">
import { computed } from 'vue'
import type { Attachment } from '@shared/types'
import { fileSize } from '../lib/format'
import Icon from './Icon.vue'

const props = defineProps<{ attachment?: Attachment; local?: { name: string; url: string | null; mime: string; size: number } }>()
const isImage = computed(() => (props.attachment?.mime ?? props.local?.mime ?? '').startsWith('image/'))
const name = computed(() => props.attachment?.filename ?? props.local?.name ?? '')
const size = computed(() => props.attachment?.sizeBytes ?? props.local?.size ?? 0)
// Thumbnail is produced asynchronously by the worker; until then show the original (or local preview).
const preview = computed(() => props.attachment?.thumbUrl ?? (props.attachment ? props.attachment.url : props.local?.url) ?? null)
const processing = computed(() => !props.attachment || props.attachment.status === 'pending')
const ratio = computed(() => {
  const m = props.attachment?.meta
  return m?.width && m?.height ? `${m.width} / ${m.height}` : '3 / 2'
})
</script>

<template>
  <a
    v-if="isImage"
    class="img"
    :href="attachment?.url"
    target="_blank"
    rel="noopener"
    :style="{ aspectRatio: ratio }"
    :class="{ processing }"
  >
    <img v-if="preview" :src="preview" :alt="name" loading="lazy" decoding="async" />
    <span v-if="processing" class="tag">{{ attachment ? 'Generating preview…' : 'Uploading…' }}</span>
    <span v-else-if="attachment?.meta.width" class="tag dim">{{ attachment.meta.width }}×{{ attachment.meta.height }}</span>
  </a>
  <a v-else class="file" :href="attachment?.url" target="_blank" rel="noopener">
    <span class="ficon"><Icon name="file" /></span>
    <span class="finfo"><strong>{{ name }}</strong><span>{{ fileSize(size) }}{{ processing ? ' · processing' : '' }}</span></span>
    <Icon v-if="attachment" name="download" class="dl" />
  </a>
</template>

<style scoped>
.img {
  position: relative; display: block; width: min(360px, 100%); max-height: 300px; border-radius: var(--radius); overflow: hidden;
  background: linear-gradient(135deg, #F1EDFF, #E6FBF8); box-shadow: var(--shadow-sm); border: 1px solid var(--line);
  transition: transform 0.3s var(--spring), box-shadow 0.2s;
}
.img:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.img img { width: 100%; height: 100%; object-fit: cover; display: block; animation: fade 0.4s var(--ease); }
@keyframes fade { from { opacity: 0; } }
.img.processing img { filter: saturate(0.7); }
.tag { position: absolute; left: 8px; bottom: 8px; padding: 3px 9px; border-radius: 999px; background: rgba(27, 27, 47, 0.72); color: #fff; font-size: 11.5px; font-weight: 700; backdrop-filter: blur(6px); }
.tag.dim { opacity: 0; transition: opacity 0.2s; }
.img:hover .tag.dim { opacity: 1; }
.processing .tag { animation: pulse 1.2s infinite; }
@keyframes pulse { 50% { opacity: 0.6; } }
.file {
  display: flex; align-items: center; gap: 10px; min-width: 240px; max-width: 360px; padding: 10px 12px; border-radius: var(--radius);
  border: 1px solid var(--line-2); background: var(--surface); text-decoration: none; color: var(--ink); box-shadow: var(--shadow-sm);
}
.ficon { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-ink); }
.ficon svg, .dl { width: 18px; height: 18px; }
.finfo { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.finfo strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.finfo span { font-size: 12px; color: var(--muted); }
.dl { color: var(--muted); }
</style>
