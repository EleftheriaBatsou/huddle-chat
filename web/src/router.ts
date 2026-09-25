import { createRouter, createWebHistory } from 'vue-router'

// Views are driven by the chat store; routes only carry which channel (and optional message) is open.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/c/general' },
    { path: '/c/:slug', name: 'channel', component: { render: () => null } },
    { path: '/:rest(.*)*', redirect: '/c/general' },
  ],
})
