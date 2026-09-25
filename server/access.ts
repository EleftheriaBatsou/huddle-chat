import { one, q } from './db.js'

export async function isMember(userId: number, channelId: number) {
  return !!(await one('SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2', [channelId, userId]))
}

/** Public channels are readable by anyone; private ones only by members. */
export async function canView(userId: number, channelId: number) {
  const row = await one<{ is_private: boolean; member: boolean }>(
    `SELECT c.is_private, EXISTS (SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = $2) AS member
     FROM channels c WHERE c.id = $1`,
    [channelId, userId],
  )
  return !!row && (!row.is_private || row.member)
}

export async function visibleChannelIds(userId: number): Promise<number[]> {
  const rows = await q<{ id: number }>(
    `SELECT id FROM channels c WHERE NOT is_private
       OR EXISTS (SELECT 1 FROM channel_members WHERE channel_id = c.id AND user_id = $1)`,
    [userId],
  )
  return rows.map((r) => r.id)
}
