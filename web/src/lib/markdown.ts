import MarkdownIt from 'markdown-it'
import { escapeHtml } from './format'

// html: false means raw HTML in messages is escaped, never rendered.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false })
md.disable(['heading', 'lheading', 'hr', 'table', 'reference'])

let myHandle = ''
let knownHandles = new Set<string>()
export function setMentionContext(me: string, handles: string[]) {
  myHandle = me.toLowerCase()
  knownHandles = new Set(handles.map((h) => h.toLowerCase()))
}

// Highlight @mentions inside plain-text runs (not inside code spans/blocks).
md.renderer.rules.text = (tokens, idx) =>
  escapeHtml(tokens[idx]!.content).replace(/(^|[^\w])@([\p{L}\w]+)/gu, (all, pre: string, h: string) => {
    const key = h.toLowerCase()
    if (!knownHandles.has(key)) return all
    return `${pre}<span class="mention${key === myHandle ? ' me' : ''}">@${h}</span>`
  })

const defaultLink = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]!.attrSet('target', '_blank')
  tokens[idx]!.attrSet('rel', 'noopener noreferrer')
  return defaultLink(tokens, idx, options, env, self)
}

const cache = new Map<string, string>()
export function renderMarkdown(src: string): string {
  const key = `${myHandle}|${src}`
  let html = cache.get(key)
  if (html === undefined) {
    html = md.render(src)
    cache.set(key, html)
    if (cache.size > 3000) cache.delete(cache.keys().next().value!)
  }
  return html
}

export function mentionsMe(src: string) {
  if (!myHandle) return false
  return new RegExp(`(^|[^\\w])@${myHandle}(?![\\p{L}\\w])`, 'iu').test(src)
}
