import type { BridgeRelayInfo } from './relay.mjs'

export interface ParsedBridgeArgs {
  port: number
  token: string | undefined
  configuredToken: boolean
  printToken: boolean
  extraOrigins: string[]
}

export interface BannerOptions {
  configuredToken: boolean
  printToken: boolean
  isTTY: boolean
}

export function parseArgs(argv: string[], env: Record<string, string | undefined>): ParsedBridgeArgs

export function formatStartupBanner(info: BridgeRelayInfo, options: BannerOptions): string
