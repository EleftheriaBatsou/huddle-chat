import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/public', import.meta.url)),
    emptyOutDir: true,
  },
})
