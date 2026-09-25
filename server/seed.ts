import { pool, q, one, withAdvisoryLock } from './db.js'
import { putObject } from './storage.js'
import { enqueue } from './queue.js'
import { indexedCount, engine } from './search.js'
import { rebuildUnreads } from './realtime.js'
import { USERS, CHANNELS, artwork, type Line } from './seed-data.js'

let s = 20260925
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]

const TASKS = [
  'wired the presence heartbeat', 'reviewed the thread-replies PR', 'fixed the flaky ws reconnect test', 'profiled the history query',
  'added the partial index for top-level messages', 'paired with Emma on the composer', 'tuned the Meilisearch ranking rules',
  'cleaned up the Valkey key naming', 'wrote the runbook for the worker service', 'migrated the attachments table',
  'set up NATS consumer lag alerts', 'benchmarked sharp thumbnail sizes', 'looked into the 502s on the preview URL',
  'refactored the event bus envelope', 'added rate limiting to message sends', 'triaged support tickets about search',
  'implemented cursor pagination for threads', 'hardened the presigned upload flow', 'reviewed the design tokens PR',
  'debugged a duplicate-message race on reconnect', 'added the jump-to-message endpoint', 'tidied the seed script',
  'updated dependencies to the latest stable versions', 'load-tested fan-out across two instances', 'wrote docs for the sync endpoint',
  'improved the typing indicator throttling', 'fixed an off-by-one in unread counts', 'added health checks to the worker',
  'investigated slow cold starts', 'shipped the emoji reactions API', 'paired on the search modal keyboard navigation',
  'set up the stage environment', 'wrote integration tests for mentions', 'optimised the reactions aggregation query',
]
const BLOCKERS = [
  'No blockers.', 'No blockers.', 'No blockers.', 'No blockers 🙌', 'Blocked on a review from @Kenji.',
  'Waiting on the design for empty states.', 'Need 10 minutes with @Tomás about the deploy pipeline.', 'None, smooth sailing.',
]

/** ~90 days of weekday standups, so infinite scroll and search have real depth. */
function standups(): { who: string; text: string; at: Date }[] {
  const out: { who: string; text: string; at: Date }[] = []
  const people = ['Kenji', 'Liam', 'Marco', 'Emma', 'Tomás', 'Zara']
  const day = new Date()
  day.setUTCHours(8, 30, 0, 0)
  for (let d = 100; d >= 14; d--) {
    const date = new Date(day.getTime() - d * 86400_000)
    if ([0, 6].includes(date.getUTCDay())) continue
    let t = date.getTime()
    for (const who of people) {
      if (rnd() < 0.15) continue // someone's always on holiday
      t += (1 + rnd() * 6) * 60_000
      out.push({ who, at: new Date(t), text: `**Standup** — Yesterday: ${pick(TASKS)}. Today: ${pick(TASKS)}. ${pick(BLOCKERS)}` })
    }
  }
  return out
}

/** Spread scripted lines backwards from "now" in realistic bursts, over roughly the last ten days. */
function timeline(n: number): Date[] {
  const out: Date[] = []
  let t = Date.now() - (2 + rnd() * 40) * 60_000
  for (let i = 0; i < n; i++) {
    out.push(new Date(t))
    t -= (0.5 + rnd() * 9) * 60_000
    if (rnd() < 0.08) t -= (8 + rnd() * 16) * 3600_000
  }
  return out.reverse()
}

export async function seedIfEmpty() {
  await withAdvisoryLock(724002, async () => {
    const existing = await one<{ n: number }>('SELECT count(*)::int AS n FROM channels')
    if (existing!.n > 0) {
      // Recover a wiped search index (e.g. fresh search service) with a bulk reindex in the worker.
      if (engine === 'meilisearch' && (await indexedCount().catch(() => -1)) === 0) {
        await enqueue('jobs.reindex', { reason: 'empty-index' })
      }
      return
    }
    console.log('seeding demo data…')
    const users = new Map<string, number>()
    for (const [name, email] of USERS) {
      const u = await one('INSERT INTO users (name, email, created_at) VALUES ($1, $2, now() - interval \'120 days\') RETURNING id', [name, email])
      users.set(name.split(' ')[0], u.id)
    }
    const everyone = [...users.values()]
    const attachmentJobs: number[] = []

    for (const ch of CHANNELS) {
      const c = await one(
        `INSERT INTO channels (slug, name, topic, is_private, created_at) VALUES ($1, $1, $2, $3, now() - interval '110 days') RETURNING id`,
        [ch.slug, ch.topic, !!ch.private],
      )
      const memberIds = ch.members ? ch.members.map((m) => users.get(m)!) : everyone
      for (const uid of memberIds) {
        await pool.query(`INSERT INTO channel_members (channel_id, user_id, role, joined_at) VALUES ($1, $2, $3, now() - interval '100 days')`, [
          c.id, uid, uid === memberIds[0] ? 'owner' : 'member',
        ])
      }

      const insert = async (who: string, body: string, at: Date, replyTo: number | null = null) =>
        (await one('INSERT INTO messages (channel_id, user_id, body, reply_to_id, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
          c.id, users.get(who), body, replyTo, at,
        ])).id as number

      if (ch.slug === 'engineering') for (const st of standups()) await insert(st.who, st.text, st.at)

      const times = timeline(ch.lines.length)
      for (const [i, [who, text, opts]] of (ch.lines as Line[]).entries()) {
        const at = times[i]
        const id = await insert(who, text, at)
        if (opts?.image) {
          const key = `attachments/seed-${ch.slug}-${i}/${opts.image}`
          const svg = artwork(opts.image)
          await putObject(key, svg, 'image/svg+xml')
          const a = await one(
            `INSERT INTO attachments (message_id, object_key, filename, mime, size_bytes, status) VALUES ($1, $2, $3, 'image/svg+xml', $4, 'pending') RETURNING id`,
            [id, key, opts.image, Buffer.byteLength(svg)],
          )
          attachmentJobs.push(a.id)
        }
        const reactions = opts?.react ?? (rnd() < 0.12 ? [pick(['👍', '❤️', '😂', '🔥', '🙌', '👀'])] : [])
        for (const emoji of reactions) {
          const n = 1 + Math.floor(rnd() * 4)
          for (const uid of [...memberIds].sort(() => rnd() - 0.5).slice(0, n)) {
            await pool.query('INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [
              id, uid, emoji, new Date(at.getTime() + 60_000),
            ])
          }
        }
        let rt = at.getTime()
        for (const [rwho, rtext] of opts?.replies ?? []) {
          rt += (1 + rnd() * 20) * 60_000
          await insert(rwho, rtext, new Date(Math.min(rt, Date.now() - 30_000)), id)
        }
      }

      // Leave everyone a few unread messages so badges show up on first load.
      for (const uid of memberIds) {
        const back = Math.floor(rnd() * 8)
        await pool.query(
          `UPDATE channel_members SET last_read_message_id = (
             SELECT (array_agg(id ORDER BY created_at DESC, id DESC))[$3::int + 1] FROM messages WHERE channel_id = $1 AND reply_to_id IS NULL)
           WHERE channel_id = $1 AND user_id = $2`,
          [c.id, uid, back],
        )
      }
    }

    await rebuildUnreads()
    for (const id of attachmentJobs) await enqueue('jobs.attachment', { attachmentId: id })
    await enqueue('jobs.reindex', { reason: 'seed' })
    const n = await q('SELECT count(*)::int AS n FROM messages')
    console.log(`seeded ${n[0].n} messages; ${attachmentJobs.length} attachment jobs + bulk reindex queued`)
  })
}
