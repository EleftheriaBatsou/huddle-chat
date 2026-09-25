<script setup lang="ts">
import { computed } from 'vue'
import { avatarColor, avatarInk, initials } from '../lib/format'
import type { PresenceStatus, User } from '@shared/types'

const props = withDefaults(defineProps<{ user?: User | null; size?: number; status?: PresenceStatus | null }>(), { size: 36, status: null })
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: props.user ? avatarColor(props.user.id) : '#D9D4F0',
  color: props.user ? avatarInk(props.user.id) : '#fff',
  fontSize: `${Math.round(props.size * 0.38)}px`,
  borderRadius: `${Math.round(props.size * 0.34)}px`,
}))
</script>

<template>
  <span class="avatar" :style="style" :title="user?.name">
    <img v-if="user?.avatarUrl" :src="user.avatarUrl" alt="" />
    <template v-else>{{ user ? initials(user.name) : '?' }}</template>
    <span v-if="status" class="dot" :class="status" />
  </span>
</template>

<style scoped>
.avatar {
  position: relative; flex: none; display: inline-grid; place-items: center;
  font-weight: 800; letter-spacing: -0.02em; user-select: none;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
.dot { position: absolute; right: -3px; bottom: -3px; width: 12px; height: 12px; border-width: 2.5px; transition: background 0.3s; }
</style>
