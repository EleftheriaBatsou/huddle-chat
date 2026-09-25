import { Meilisearch } from 'meilisearch'
import { config } from './config.js'
import { q } from './db.js'
import type { SearchResult } from '../shared/types.js'

// Meilisearch is the primary engine; Postgres full-text is only a fallback when no search service is wired.
const meili = config.meili ? new Meilisearch({ host: config.meili.host, apiKey: config.meili.apiKey }) : null
export const INDEX = 'messages'
export const engine: 'meilisearch' | 'postgres' = meili ? 'meilisearch' : 'postgres'
const PRE = '\u0002'
const POST = '\u0003'

export interface SearchDoc {
  id: number
  channelId: number
  userId: number
  userName: string
  body: string
  createdAt: number
}

export async function initSearch() {
  if (!meili) return
  await meili.createIndex(INDEX, { primaryKey: 'id' }).waitTask().catch(() => {})
  await meili
    .index(INDEX)
    .updateSettings({
      searchableAttributes: ['body', 'userName'],
      filterableAttributes: ['channelId', 'userId'],
      sortableAttributes: ['createdAt'],
      displayedAttributes: ['id', 'channelId', 'userId', 'body', 'createdAt'],
    })
    .waitTask()
}

export async function indexedCount(): Promise<number> {
  if (!meili) return 0
  const stats = await meili.index(INDEX).getStats()
  return stats.numberOfDocuments
}

/** Fire-and-forget: Meilisearch enqueues the task, so this never blocks a send. */
export function indexMessage(doc: SearchDoc) {
  if (!meili) return
  meili.index(INDEX).addDocuments([doc]).catch((e) => console.error('index failed', e.message))
}

export function removeMessage(id: number) {
  if (!meili) return
  meili.index(INDEX).deleteDocument(id).catch((e) => console.error('unindex failed', e.message))
}

export async function searchMessages(query: string, channelIds: number[], limit = 20): Promise<SearchResult> {
  const started = performance.now()
  if (!channelIds.length) return { hits: [], estimatedTotal: 0, tookMs: 0, engine }
  if (meili) {
    const res = await meili.index(INDEX).search<SearchDoc>(query, {
      filter: `channelId IN [${channelIds.join(',')}]`,
      limit,
      attributesToCrop: ['body'],
      cropLength: 28,
      cropMarker: '…',
      attributesToHighlight: ['body'],
      highlightPreTag: PRE,
      highlightPostTag: POST,
    })
    return {
      hits: res.hits.map((h) => ({
        id: h.id,
        channelId: h.channelId,
        userId: h.userId,
        createdAt: new Date(h.createdAt * 1000).toISOString(),
        snippet: (h._formatted?.body as string) ?? h.body,
      })),
      estimatedTotal: res.estimatedTotalHits ?? res.hits.length,
      tookMs: res.processingTimeMs,
      engine,
    }
  }
  const rows = await q(
    `SELECT id, channel_id, user_id, created_at,
            ts_headline('english', body, websearch_to_tsquery('english', $1),
                        'StartSel=${PRE}, StopSel=${POST}, MaxWords=28, MinWords=10') AS snippet
     FROM messages
     WHERE deleted_at IS NULL AND channel_id = ANY($2)
       AND to_tsvector('english', body) @@ websearch_to_tsquery('english', $1)
     ORDER BY created_at DESC LIMIT $3`,
    [query, channelIds, limit],
  )
  return {
    hits: rows.map((r) => ({ id: r.id, channelId: r.channel_id, userId: r.user_id, createdAt: r.created_at.toISOString(), snippet: r.snippet })),
    estimatedTotal: rows.length,
    tookMs: Math.round(performance.now() - started),
    engine,
  }
}
