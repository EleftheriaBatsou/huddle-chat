import os from 'node:os'
import crypto from 'node:crypto'

// Zerops container hostnames look like "node-id-2.runtime.appstage.zerops" → "appstage-n2".
function instanceName() {
  const parts = os.hostname().split('.')
  if (parts.length >= 3 && parts[0]!.startsWith('node-id-')) return `${parts[2]}-n${parts[0]!.slice(8)}`
  return `${os.hostname().slice(0, 12)}-${crypto.randomBytes(2).toString('hex')}`
}

function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name}`)
  return v
}

export const config = {
  dev: process.env.NODE_ENV !== 'production',
  port: Number(process.env.PORT ?? 3000),
  // Short, human-readable id for this container — shown in the UI to prove multi-instance fan-out.
  instance: instanceName(),
  appSecret: req('APP_SECRET'),
  databaseUrl: req('DATABASE_URL'),
  redisUrl: req('REDIS_URL'),
  nats: {
    servers: `${req('NATS_HOST')}:${req('NATS_PORT')}`,
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASS,
  },
  meili: process.env.MEILI_HOST
    ? { host: process.env.MEILI_HOST, apiKey: process.env.MEILI_MASTER_KEY ?? '' }
    : null,
  s3: {
    endpoint: req('S3_ENDPOINT'),
    bucket: req('S3_BUCKET'),
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKeyId: req('S3_KEY'),
    secretAccessKey: req('S3_SECRET'),
  },
  presenceTtlSec: 40,
  typingTtlSec: 6,
  rateLimit: { windowSec: 10, max: 20 },
  maxUploadBytes: 25 * 1024 * 1024,
}
