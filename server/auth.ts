import crypto from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { config } from './config.js'

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const sign = (payload: string) => crypto.createHmac('sha256', config.appSecret).update(payload).digest('base64url')

export function issueToken(userId: number): string {
  const payload = b64(JSON.stringify({ uid: userId, exp: Date.now() + 30 * 24 * 3600_000 }))
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token: string | undefined | null): number | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return exp > Date.now() ? Number(uid) : null
  } catch {
    return null
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: number
  }
}

export async function requireUser(req: FastifyRequest) {
  const header = req.headers.authorization
  const uid = verifyToken(header?.startsWith('Bearer ') ? header.slice(7) : null)
  if (!uid) {
    const err = new Error('Not signed in') as Error & { statusCode: number }
    err.statusCode = 401
    throw err
  }
  req.userId = uid
}
