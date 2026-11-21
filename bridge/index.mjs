import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpHandler, serveStdio } from './mcp.mjs'
import { createBridgeRelay } from './relay.mjs'

export function parseArgs(argv, env) {
  let portText = env.MINDMAP_BRIDGE_PORT
  let token = env.MINDMAP_BRIDGE_TOKEN
  let printToken = false
  const extraOrigins = []

  if (env.MINDMAP_BRIDGE_ORIGIN) {
    for (const part of env.MINDMAP_BRIDGE_ORIGIN.split(',')) {
      const trimmed = part.trim()
      if (trimmed) extraOrigins.push(trimmed)
    }
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--port' && argv[i + 1] !== undefined) {
      portText = argv[++i]
    } else if (arg === '--token' && argv[i + 1] !== undefined) {
      token = argv[++i]
    } else if (arg === '--origin' && argv[i + 1] !== undefined) {
      extraOrigins.push(argv[++i])
    } else if (arg === '--print-token') {
      printToken = true
    } else if (arg === '--help' || arg === '-h') {
      process.stderr.write(
        'Usage: node bridge/index.mjs [--port 4317] [--token <secret>] [--print-token] [--origin <url>]\n',
      )
      process.exit(0)
    }
  }

  let port = 4317
  if (portText !== undefined && portText !== '') {
    const parsed = Number(portText)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      throw new Error(`Invalid port "${portText}"; expected integer 0..65535`)
    }
    port = parsed
  }

  const normalizedToken = typeof token === 'string' && token.length > 0 ? token : undefined
  return {
    port,
    token: normalizedToken,
    configuredToken: normalizedToken !== undefined,
    printToken,
    extraOrigins,
  }
}

export function formatStartupBanner(info, { configuredToken, printToken, isTTY }) {
  const listenLine = `[mindmap-bridge] Listening on http://${info.host}:${info.port} (ws://${info.host}:${info.port}/ws)`
  let tokenLine
  if (configuredToken) {
    tokenLine = '[mindmap-bridge] Pairing token: <configured>'
  } else if (printToken || isTTY) {
    tokenLine = `[mindmap-bridge] Pairing token: ${info.token}`
  } else {
    tokenLine =
      '[mindmap-bridge] Pairing token generated (pass --print-token or set MINDMAP_BRIDGE_TOKEN)'
  }
  return `${listenLine}\n${tokenLine}\n`
}

async function main() {
  const config = parseArgs(process.argv.slice(2), process.env)
  const relay = createBridgeRelay({
    port: config.port,
    token: config.token,
    extraOrigins: config.extraOrigins,
  })
  const info = await relay.start()

  // Never write diagnostics to stdout — stdout carries MCP JSON-RPC frames.
  process.stderr.write(
    formatStartupBanner(info, {
      configuredToken: config.configuredToken,
      printToken: config.printToken,
      isTTY: Boolean(process.stderr.isTTY),
    }),
  )

  const stdio = serveStdio(createMcpHandler(relay))

  let shuttingDown = false
  async function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    stdio.close()
    await relay.stop()
  }

  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0))
  })
  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0))
  })

  await stdio.done
  await shutdown()
}

const isMainModule =
  Boolean(process.argv[1]) &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])

if (isMainModule) {
  await main()
}
