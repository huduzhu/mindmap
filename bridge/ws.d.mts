import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

export const MAX_MESSAGE_BYTES: number

export interface WsConnection {
  sendText: (text: string) => boolean
  close: (code?: number, reason?: string) => void
  onMessage: (fn: (text: string) => void) => () => boolean
  onClose: (fn: (code: number, reason: string) => void) => () => boolean
}

export function acceptWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): WsConnection | null
