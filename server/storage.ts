import crypto from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from './config.js'

export const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: true, // MinIO-backed object storage requires path-style addressing
  credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
})

export function newObjectKey(filename: string) {
  const safe = filename.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80) || 'file'
  return `attachments/${crypto.randomUUID()}/${safe}`
}

/** Presigned PUT so the browser uploads straight to object storage, never through the API. */
export function presignPut(key: string, mime: string) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, ContentType: mime }), { expiresIn: 600 })
}

// Presigned GETs are cached so repeat views hit the browser cache with an identical URL.
const getCache = new Map<string, { url: string; exp: number }>()
export async function presignGet(key: string) {
  const hit = getCache.get(key)
  if (hit && hit.exp > Date.now()) return hit.url
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), { expiresIn: 3600 })
  getCache.set(key, { url, exp: Date.now() + 50 * 60_000 })
  if (getCache.size > 5000) getCache.delete(getCache.keys().next().value!)
  return url
}

export async function putObject(key: string, body: Buffer | string, mime: string) {
  await s3.send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: body, ContentType: mime }))
}

export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: config.s3.bucket, Key: key }))
    return head.ContentLength ?? null
  } catch {
    return null
  }
}

export const fileUrl = (key: string) => `/files/${key}`
