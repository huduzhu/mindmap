import type { Readable, Writable } from 'node:stream'
import type { BridgeRelay } from './relay.mjs'

export const PROTOCOL_VERSION: string

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export const TOOLS: McpToolDefinition[]

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

export interface McpHandler {
  handleMessage: (msg: unknown) => Promise<JsonRpcResponse | null>
}

export function createMcpHandler(relay: BridgeRelay): McpHandler

export function serveStdio(
  handler: McpHandler,
  input?: Readable,
  output?: Writable,
): { done: Promise<void>; close: () => void }
