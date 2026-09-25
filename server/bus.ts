import { Redis } from 'ioredis'
import { config } from './config.js'
import type { BusEnvelope, ServerEvent } from '../shared/types.js'

// Three connections: commands, publishing, and a dedicated subscriber (a subscribed
// connection can't issue normal commands).
export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 })
const pub = new Redis(config.redisUrl)
const sub = new Redis(config.redisUrl)

export const BUS_CHANNEL = 'chat:events'

/**
 * Publish an event to EVERY app instance via Valkey pub/sub. Instances never deliver
 * directly to their own sockets — they all receive from the bus, so a user on
 * instance A and a user on instance B see exactly the same stream.
 */
export function publish(route: BusEnvelope['route'], event: ServerEvent) {
  const env: BusEnvelope = { origin: config.instance, route, event }
  return pub.publish(BUS_CHANNEL, JSON.stringify(env))
}

export async function subscribe(handler: (env: BusEnvelope) => void) {
  await sub.subscribe(BUS_CHANNEL)
  sub.on('message', (_ch, raw) => {
    try {
      handler(JSON.parse(raw))
    } catch (err) {
      console.error('bad bus message', err)
    }
  })
}

export async function busStats() {
  const [, subs] = (await redis.call('PUBSUB', 'NUMSUB', BUS_CHANNEL)) as [string, number]
  return { subscribers: Number(subs) }
}
