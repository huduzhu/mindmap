import { createMcpHandler, serveStdio } from './mcp.mjs'
import { createBridgeRelay } from './relay.mjs'

function parseArgs(argv, env) {
  let portText = env.MINDMAP_BRIDGE_PORT
  let token = env.MINDMAP_BRIDGE_TOKEN
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
    } else if (arg === '--help' || arg === '-h') {
      process.stderr.write(
        'Usage: node bridge/index.mjs [--port 4317] [--token <secret>] [--origin <url>]\n',
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

  return { port, token, extraOrigins }
}

const config = parseArgs(process.argv.slice(2), process.env)
const relay = createBridgeRelay(config)
const info = await relay.start()

// Never write diagnostics to stdout — stdout carries MCP JSON-RPC frames.
process.stderr.write(
  `[mindmap-bridge] Listening on http://${info.host}:${info.port} (ws://${info.host}:${info.port}/ws)\n` +
    `[mindmap-bridge] Pairing token: ${info.token}\n`,
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
