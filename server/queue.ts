import { connect, type NatsConnection } from '@nats-io/transport-node'
import { jetstream, jetstreamManager, RetentionPolicy, type JetStreamClient } from '@nats-io/jetstream'
import { config } from './config.js'

export const STREAM = 'CHAT_JOBS'
let nc: NatsConnection | null = null
let js: JetStreamClient | null = null

/** Jobs go through a JetStream work-queue stream so they survive a worker restart. */
export async function initQueue() {
  nc = await connect({ servers: config.nats.servers, user: config.nats.user, pass: config.nats.pass, name: `app-${config.instance}` })
  const jsm = await jetstreamManager(nc)
  try {
    await jsm.streams.info(STREAM)
  } catch {
    await jsm.streams.add({ name: STREAM, subjects: ['jobs.>'], retention: RetentionPolicy.Workqueue })
  }
  js = jetstream(nc)
}

export async function enqueue(subject: 'jobs.attachment' | 'jobs.reindex', payload: object) {
  if (!js) throw new Error('queue not ready')
  await js.publish(subject, JSON.stringify(payload))
}

export const queueHealthy = () => !!nc && !nc.isClosed()
