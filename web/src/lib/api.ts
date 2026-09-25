const TOKEN_KEY = 'huddle.token'

// The session token is per-tab (sessionStorage) so two tabs can be two different people in a demo.
// All chat data itself lives server-side — nothing but this credential is stored in the browser.
export const session = {
  get token(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set token(v: string | null) {
    try {
      v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY)
    } catch {}
  },
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (session.token) headers.Authorization = `Bearer ${session.token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) session.token = null
    throw new ApiError(res.status, data.error ?? res.statusText)
  }
  return res.json()
}
