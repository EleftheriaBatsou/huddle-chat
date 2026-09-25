import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import { config } from './config.js'
import { migrate } from './db.js'
import { initQueue } from './queue.js'
import { initSearch } from './search.js'
import { initHub, handleUpgrade } from './hub.js'
import { seedIfEmpty } from './seed.js'
import api from './routes/api.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = Fastify({ logger: { level: config.dev ? 'info' : 'warn' }, trustProxy: true, bodyLimit: 1024 * 1024 })

app.setErrorHandler((err: any, _req, reply) => {
  const status = err.statusCode ?? 500
  if (status >= 500) app.log.error(err)
  reply.status(status).send({ error: status >= 500 ? 'Something went wrong' : err.message })
})

await migrate()
await Promise.all([initQueue(), initSearch().catch((e) => app.log.warn(`search init failed: ${e.message}`))])
await initHub()
await app.register(api)

// Realtime socket lives at /ws; everything else on the upgrade path (Vite HMR in dev) is left alone.
app.server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws')) handleUpgrade(req, socket, head)
})

if (config.dev) {
  // One port for API + WebSocket + Vite (with HMR) so the dev subdomain behaves like prod.
  const { default: middie } = await import('@fastify/middie')
  const { createServer } = await import('vite')
  await app.register(middie)
  const vite = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    appType: 'spa',
    server: {
      middlewareMode: true,
      allowedHosts: true,
      // Browsers reach the dev container through the HTTPS balancer, so HMR must dial 443.
      hmr: { server: app.server, clientPort: process.env.zeropsSubdomain ? 443 : undefined },
    },
  })
  app.use((req: any, res: any, next: any) =>
    /^\/(api|files|ws)(\/|$)/.test(req.url) ? next() : vite.middlewares(req, res, next),
  )
} else {
  const { default: fastifyStatic } = await import('@fastify/static')
  const publicDir = path.join(root, 'dist', 'public')
  await app.register(fastifyStatic, {
    root: publicDir,
    setHeaders: (res, file) => {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.header('Cache-Control', 'public, max-age=31536000, immutable')
    },
  })
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || /^\/(api|files)\//.test(req.url)) return reply.status(404).send({ error: 'Not found' })
    reply.header('Cache-Control', 'no-cache').type('text/html').send(indexHtml)
  })
}

await app.listen({ host: '0.0.0.0', port: config.port })
app.log.warn(`chat instance ${config.instance} listening on :${config.port} (${config.dev ? 'dev' : 'prod'})`)

seedIfEmpty().catch((err) => app.log.error(err, 'seed failed'))

const shutdown = async () => {
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
