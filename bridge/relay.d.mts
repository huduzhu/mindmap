export const DEFAULT_ALLOWED_ORIGINS: string[]

export type BridgeStatus =
  | { connected: false }
  | {
      connected: true
      projectId: string
      projectName: string
      mode: 'read-only' | 'approve-writes'
      rev: number
    }

export interface BridgeRelayOptions {
  port?: number
  token?: string
  extraOrigins?: string[]
  requestTimeoutMs?: number
  helloTimeoutMs?: number
}

export interface BridgeRelayInfo {
  host: '127.0.0.1'
  port: number
  token: string
}

export interface BridgeRelay {
  start: () => Promise<BridgeRelayInfo>
  stop: () => Promise<void>
  getStatus: () => BridgeStatus
  callBrowser: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}

export function createBridgeRelay(options?: BridgeRelayOptions): BridgeRelay
