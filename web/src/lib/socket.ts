import type { ClientFrame, ServerEvent } from '@shared/types'
import { session } from './api'

export type SocketState = 'connecting' | 'open' | 'reconnecting' | 'offline'

/**
 * WebSocket with exponential-backoff reconnect and a presence heartbeat.
 * `onReconnect` fires after every re-open so the store can fetch what it missed.
 */
export class ChatSocket {
  private ws: WebSocket | null = null
  private attempts = 0
  private hbTimer: number | undefined
  private retryTimer: number | undefined
  private everOpened = false
  private closedByUs = false
  status: 'online' | 'away' = 'online'
  watching: number | null = null

  constructor(
    private onEvent: (ev: ServerEvent) => void,
    private onState: (s: SocketState) => void,
    private onReconnect: () => void,
  ) {}

  connect() {
    this.closedByUs = false
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(session.token ?? '')}`)
    this.ws = ws
    this.onState(this.everOpened ? 'reconnecting' : 'connecting')

    ws.onopen = () => {
      const isReconnect = this.everOpened
      this.everOpened = true
      this.attempts = 0
      this.onState('open')
      this.send({ type: 'watch', channelId: this.watching })
      this.send({ type: 'hb', status: this.status })
      clearInterval(this.hbTimer)
      this.hbTimer = window.setInterval(() => this.send({ type: 'hb', status: this.status }), 15_000)
      if (isReconnect) this.onReconnect()
    }
    ws.onmessage = (e) => {
      try {
        this.onEvent(JSON.parse(e.data))
      } catch (err) {
        console.error('bad frame', err)
      }
    }
    ws.onclose = () => {
      clearInterval(this.hbTimer)
      if (this.closedByUs) return
      this.onState(navigator.onLine ? 'reconnecting' : 'offline')
      const delay = Math.min(10_000, 400 * 2 ** this.attempts++) * (0.7 + Math.random() * 0.6)
      clearTimeout(this.retryTimer)
      this.retryTimer = window.setTimeout(() => this.connect(), delay)
    }
    ws.onerror = () => ws.close()
  }

  /** Force a fresh connection (e.g. the demo "reconnect" button, or coming back online). */
  reconnect() {
    this.ws?.close()
  }

  close() {
    this.closedByUs = true
    clearInterval(this.hbTimer)
    clearTimeout(this.retryTimer)
    this.ws?.close()
  }

  send(frame: ClientFrame) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame))
  }

  watch(channelId: number | null) {
    this.watching = channelId
    this.send({ type: 'watch', channelId })
  }

  setStatus(status: 'online' | 'away') {
    if (status === this.status) return
    this.status = status
    this.send({ type: 'hb', status })
  }
}
