import pg from 'pg'
import { config } from './config.js'

// bigint ids/counts come back as strings by default; they fit comfortably in a JS number here.
pg.types.setTypeParser(20, (v) => Number(v))

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params)
  return res.rows as T[]
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0]
}

/** Runs fn while holding a cluster-wide advisory lock, so only one app instance migrates/seeds. */
export async function withAdvisoryLock<T>(key: number, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [key])
    try {
      return await fn()
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key])
    }
  } finally {
    client.release()
  }
}

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL UNIQUE,
  avatar_key  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id          bigserial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  topic       text NOT NULL DEFAULT '',
  is_private  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id            bigint NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id               bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  text NOT NULL DEFAULT 'member',
  last_read_message_id  bigint,
  joined_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS channel_members_user_idx ON channel_members (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id           bigserial PRIMARY KEY,
  channel_id   bigint NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id      bigint NOT NULL REFERENCES users(id),
  body         text NOT NULL,
  reply_to_id  bigint REFERENCES messages(id) ON DELETE SET NULL,
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- History is paginated with a (created_at, id) keyset cursor — never OFFSET.
CREATE INDEX IF NOT EXISTS messages_channel_created_idx ON messages (channel_id, created_at, id);
CREATE INDEX IF NOT EXISTS messages_channel_toplevel_idx ON messages (channel_id, created_at, id) WHERE reply_to_id IS NULL;
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (reply_to_id, created_at) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_changed_idx ON messages (GREATEST(edited_at, deleted_at))
  WHERE edited_at IS NOT NULL OR deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS attachments (
  id          bigserial PRIMARY KEY,
  message_id  bigint REFERENCES messages(id) ON DELETE CASCADE,
  object_key  text NOT NULL,
  filename    text NOT NULL,
  mime        text NOT NULL,
  size_bytes  bigint NOT NULL,
  thumb_key   text,
  status      text NOT NULL DEFAULT 'pending',
  meta        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_message_idx ON attachments (message_id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id  bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
`

export async function migrate() {
  await withAdvisoryLock(724001, () => pool.query(SCHEMA))
}
