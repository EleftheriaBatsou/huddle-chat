export const PALETTE = ['#7C5CFF', '#15D7C4', '#FFC93C', '#FF5C7C', '#0D99FF', '#2BD968']
export const avatarColor = (id: number) => PALETTE[(id - 1 + PALETTE.length) % PALETTE.length]
// Yellow and teal need dark initials for contrast.
export const avatarInk = (id: number) => (['#FFC93C', '#15D7C4', '#2BD968'].includes(avatarColor(id)) ? '#1B1B2F' : '#fff')
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
export const firstName = (name: string) => name.split(' ')[0] ?? name

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export function relative(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Search snippets arrive with \u0002/\u0003 markers — escape first, then turn markers into <mark>. */
export function snippetHtml(s: string) {
  // Snippets are shown as plain text, so drop inline markdown markers (**bold**, _italic_, `code`).
  const plain = s.replace(/\*\*|__|`/g, '').replace(/(^|\s)_(\S)/g, '$1$2').replace(/(\S)_(\s|$)/g, '$1$2')
  return escapeHtml(plain).replace(/\u0002/g, '<mark>').replace(/\u0003/g, '</mark>')
}
