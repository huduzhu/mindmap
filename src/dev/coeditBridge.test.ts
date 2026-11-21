// @vitest-environment node
import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatStartupBanner } from '../../bridge/index.mjs'
import { createMcpHandler, serveStdio } from '../../bridge/mcp.mjs'
import { createBridgeRelay, type BridgeRelay } from '../../bridge/relay.mjs'

interface NodeWebSocketInit {
  headers?: Record<string, string>
}

const NodeWebSocket = WebSocket as unknown as new (
  url: string,
  init?: NodeWebSocketInit,
) => WebSocket

const relays: BridgeRelay[] = []
const sockets: WebSocket[] = []

afterEach(async () => {
  for (const ws of sockets.splice(0)) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  }
  for (const relay of relays.splice(0)) {
    await relay.stop()
  }
})

async function startTestRelay(token = 'test-secret-token') {
  const relay = createBridgeRelay({ port: 0, token, requestTimeoutMs: 3000 })
  relays.push(relay)
  const info = await relay.start()
  return { relay, info }
}

function connectSocket(url: string, origin = 'http://localhost:5173'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new NodeWebSocket(url, origin ? { headers: { Origin: origin } } : undefined)
    sockets.push(ws)
    const onOpen = () => {
      cleanup()
      resolve(ws)
    }
    const onError = (event: Event) => {
      cleanup()
      reject(new Error(`WebSocket connection failed: ${event.type}`))
    }
    const cleanup = () => {
      ws.removeEventListener('open', onOpen)
      ws.removeEventListener('error', onError)
    }
    ws.addEventListener('open', onOpen)
    ws.addEventListener('error', onError)
  })
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve({ code: 1005, reason: '' })
      return
    }
    ws.addEventListener(
      'close',
      (event) => {
        const closeEvent = event as CloseEvent
        resolve({ code: closeEvent.code, reason: closeEvent.reason })
      },
      { once: true },
    )
  })
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMsg = (event: MessageEvent) => {
      cleanup()
      resolve(JSON.parse(String(event.data)) as Record<string, unknown>)
    }
    const onClose = () => {
      cleanup()
      reject(new Error('Socket closed while waiting for message'))
    }
    const cleanup = () => {
      ws.removeEventListener('message', onMsg)
      ws.removeEventListener('close', onClose)
    }
    ws.addEventListener('message', onMsg)
    ws.addEventListener('close', onClose)
  })
}

async function pairBrowser(
  url: string,
  token: string,
  mode: 'read-only' | 'approve-writes' = 'approve-writes',
  origin = 'http://localhost:5173',
) {
  const ws = await connectSocket(url, origin)
  const welcomePromise = nextMessage(ws)
  ws.send(
    JSON.stringify({
      type: 'hello',
      token,
      projectId: 'proj-1',
      projectName: 'Launch Plan',
      mode,
      rev: 1,
    }),
  )
  const welcome = await welcomePromise
  expect(welcome).toEqual({ type: 'welcome', protocolVersion: 1 })
  return ws
}

describe('co-edit local bridge relay and MCP server', () => {
  it('serves /health with CORS and Private Network headers for allowed origins and blocks disallowed origins', async () => {
    const { info } = await startTestRelay('secret-never-leaked')
    const baseUrl = `http://${info.host}:${info.port}`

    const okRes = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://huduzhu.github.io' },
    })
    expect(okRes.status).toBe(200)
    expect(okRes.headers.get('access-control-allow-origin')).toBe('https://huduzhu.github.io')
    expect(okRes.headers.get('access-control-allow-private-network')).toBe('true')
    const bodyText = await okRes.text()
    expect(bodyText).not.toContain('secret-never-leaked')
    expect(JSON.parse(bodyText)).toEqual({ ok: true, protocolVersion: 1, connected: false })

    const preflight = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://huduzhu.github.io' },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true')

    const denied = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://evil.example' },
    })
    expect(denied.status).toBe(403)
  })

  it('rejects disallowed origins and invalid pairing tokens on WebSocket upgrade', async () => {
    const { info } = await startTestRelay('correct-token')
    const wsUrl = `ws://${info.host}:${info.port}/ws`

    await expect(connectSocket(wsUrl, 'https://evil.example')).rejects.toThrow(/failed/i)

    const ws = await connectSocket(wsUrl, 'http://localhost:5173')
    const closed = waitForClose(ws)
    ws.send(
      JSON.stringify({
        type: 'hello',
        token: 'wrong-token',
        projectId: 'proj-1',
        projectName: 'Launch Plan',
        mode: 'approve-writes',
      }),
    )
    const closeInfo = await closed
    expect(closeInfo.code).toBe(4001)
  })

  it('rejects a second browser trying to pair while a session is active (4009)', async () => {
    const { info } = await startTestRelay('shared-token')
    const wsUrl = `ws://${info.host}:${info.port}/ws`

    await pairBrowser(wsUrl, 'shared-token', 'approve-writes')

    const second = await connectSocket(wsUrl, 'http://localhost:5173')
    const closed = waitForClose(second)
    second.send(
      JSON.stringify({
        type: 'hello',
        token: 'shared-token',
        projectId: 'proj-2',
        projectName: 'Other Map',
        mode: 'read-only',
      }),
    )
    const closeInfo = await closed
    expect(closeInfo.code).toBe(4009)
  })

  it('runs full MCP initialize, tools/list, read tools, and propose_edits round-trip over stdio', async () => {
    const { relay, info } = await startTestRelay('stdio-token')
    const wsUrl = `ws://${info.host}:${info.port}/ws`
    const ws = await pairBrowser(wsUrl, 'stdio-token', 'approve-writes')

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as {
        type?: string
        id?: string
        method?: string
        params?: Record<string, unknown>
      }
      if (msg.type !== 'rpc' || !msg.id) return
      switch (msg.method) {
        case 'get_map':
          ws.send(
            JSON.stringify({
              type: 'rpc_result',
              id: msg.id,
              ok: true,
              result: { projectName: 'Launch Plan', rev: 1, root: { id: 'root', title: 'Launch' } },
            }),
          )
          break
        case 'get_node':
          ws.send(
            JSON.stringify({
              type: 'rpc_result',
              id: msg.id,
              ok: true,
              result: { rev: 1, parentId: 'root', node: { id: msg.params?.id, title: 'Press' } },
            }),
          )
          break
        case 'search_nodes':
          ws.send(
            JSON.stringify({
              type: 'rpc_result',
              id: msg.id,
              ok: true,
              result: { rev: 1, matches: [{ id: 'n1', title: 'Press', parentId: 'root' }] },
            }),
          )
          break
        case 'propose_edits':
          ws.send(
            JSON.stringify({
              type: 'rpc_result',
              id: msg.id,
              ok: true,
              result: { queued: true, batchId: 'b1' },
            }),
          )
          break
      }
    })

    const input = new PassThrough()
    const output = new PassThrough()
    const stdio = serveStdio(createMcpHandler(relay), input, output)

    const responses: Record<string, unknown>[] = []
    const pendingWaiters = new Map<number, (msg: Record<string, unknown>) => void>()
    const outRl = createInterface({ input: output })
    outRl.on('line', (line) => {
      const parsed = JSON.parse(line) as Record<string, unknown>
      responses.push(parsed)
      if (typeof parsed.id === 'number') {
        const resolve = pendingWaiters.get(parsed.id)
        if (resolve) {
          pendingWaiters.delete(parsed.id)
          resolve(parsed)
        }
      }
    })

    function rpc(id: number, method: string, params?: Record<string, unknown>) {
      const promise = new Promise<Record<string, unknown>>((resolve) => {
        pendingWaiters.set(id, resolve)
      })
      input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      return promise
    }

    const init = await rpc(1, 'initialize', { protocolVersion: '2025-03-26' })
    expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe(
      'mindmap-studio-bridge',
    )

    // Notification should emit nothing
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)

    const list = await rpc(2, 'tools/list')
    const toolNames = (list.result as { tools: { name: string }[] }).tools.map((t) => t.name)
    expect(toolNames).toEqual([
      'mindmap_status',
      'get_map',
      'get_node',
      'search_nodes',
      'propose_edits',
    ])

    const status = await rpc(3, 'tools/call', { name: 'mindmap_status', arguments: {} })
    const statusPayload = JSON.parse(
      (status.result as { content: { text: string }[] }).content[0]!.text,
    ) as { connected: boolean; projectId: string; mode: string }
    expect(statusPayload).toMatchObject({
      connected: true,
      projectId: 'proj-1',
      mode: 'approve-writes',
    })

    const mapRes = await rpc(4, 'tools/call', { name: 'get_map', arguments: {} })
    expect((mapRes.result as { isError?: boolean }).isError).toBeUndefined()

    const nodeRes = await rpc(5, 'tools/call', { name: 'get_node', arguments: { id: 'n1' } })
    expect((nodeRes.result as { content: { text: string }[] }).content[0]!.text).toContain('Press')

    const searchRes = await rpc(6, 'tools/call', {
      name: 'search_nodes',
      arguments: { query: 'Press' },
    })
    expect((searchRes.result as { content: { text: string }[] }).content[0]!.text).toContain('n1')

    const proposeRes = await rpc(7, 'tools/call', {
      name: 'propose_edits',
      arguments: {
        baseRev: 1,
        summary: 'Add task',
        operations: [{ type: 'add_node', parentId: 'root', title: 'QA' }],
      },
    })
    expect(
      JSON.parse((proposeRes.result as { content: { text: string }[] }).content[0]!.text),
    ).toEqual({ queued: true, batchId: 'b1' })

    input.end()
    await stdio.done
    outRl.close()
    // Ensure notifications produced no extra lines
    expect(responses).toHaveLength(7)
  })

  it('blocks propose_edits in read-only mode and clears access immediately on disconnect', async () => {
    const { relay, info } = await startTestRelay('ro-token')
    const wsUrl = `ws://${info.host}:${info.port}/ws`
    const ws = await pairBrowser(wsUrl, 'ro-token', 'read-only')

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as { type?: string; id?: string; method?: string }
      if (msg.type === 'rpc' && msg.id && msg.method === 'get_map') {
        ws.send(
          JSON.stringify({
            type: 'rpc_result',
            id: msg.id,
            ok: true,
            result: { projectName: 'Launch Plan', rev: 1, root: { id: 'root', title: 'Launch' } },
          }),
        )
      }
    })

    const mcp = createMcpHandler(relay)

    const mapOk = (await mcp.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_map', arguments: {} },
    })) as { result: { isError?: boolean } }
    expect(mapOk.result.isError).toBeUndefined()

    const writeBlocked = (await mcp.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'propose_edits',
        arguments: {
          baseRev: 1,
          summary: 'Should be blocked',
          operations: [{ type: 'rename_node', id: 'root', title: 'X' }],
        },
      },
    })) as { result: { isError?: boolean; content: { text: string }[] } }
    expect(writeBlocked.result.isError).toBe(true)
    expect(writeBlocked.result.content[0]!.text).toContain('READ_ONLY')

    // Explicit disconnect revokes all reads and writes immediately
    const closed = waitForClose(ws)
    ws.send(JSON.stringify({ type: 'disconnect' }))
    await closed
    expect(relay.getStatus()).toEqual({ connected: false })

    const readAfter = (await mcp.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_map', arguments: {} },
    })) as { result: { isError?: boolean; content: { text: string }[] } }
    expect(readAfter.result.isError).toBe(true)
    expect(readAfter.result.content[0]!.text).toContain('NOT_CONNECTED')

    const writeAfter = (await mcp.handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'propose_edits',
        arguments: {
          baseRev: 1,
          summary: 'After disconnect',
          operations: [{ type: 'rename_node', id: 'root', title: 'X' }],
        },
      },
    })) as { result: { isError?: boolean; content: { text: string }[] } }
    expect(writeAfter.result.isError).toBe(true)
    expect(writeAfter.result.content[0]!.text).toContain('NOT_CONNECTED')
  })

  it('handles 16-bit length WebSocket frames and live state mode transitions', async () => {
    const { relay, info } = await startTestRelay('large-frame-token')
    const wsUrl = `ws://${info.host}:${info.port}/ws`
    const ws = await pairBrowser(wsUrl, 'large-frame-token', 'read-only')
    const bigText = 'N'.repeat(1200)

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as {
        type?: string
        id?: string
        method?: string
      }
      if (msg.type === 'rpc' && msg.id && msg.method === 'get_map') {
        ws.send(
          JSON.stringify({
            type: 'rpc_result',
            id: msg.id,
            ok: true,
            result: { projectName: 'Big', rev: 2, root: { id: 'root', title: bigText } },
          }),
        )
      }
    })

    // Upgrade session state to approve-writes + rev 2
    ws.send(JSON.stringify({ type: 'state', mode: 'approve-writes', rev: 2 }))
    await new Promise((r) => setTimeout(r, 25))
    expect(relay.getStatus()).toMatchObject({ connected: true, mode: 'approve-writes', rev: 2 })

    const mcp = createMcpHandler(relay)
    const mapRes = (await mcp.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_map', arguments: {} },
    })) as { result: { content: { text: string }[] } }
    expect(JSON.parse(mapRes.result.content[0]!.text)).toMatchObject({
      rev: 2,
      root: { title: bigText },
    })
  })

  it('rejects invalid propose_edits baseRev and malformed operations at the MCP boundary without calling the relay', async () => {
    const callBrowser = vi.fn()
    const stubRelay: BridgeRelay = {
      start: async () => ({ host: '127.0.0.1', port: 4317, token: 't' }),
      stop: async () => undefined,
      getStatus: () => ({
        connected: true,
        projectId: 'proj-1',
        projectName: 'Plan',
        mode: 'approve-writes',
        rev: 2,
      }),
      callBrowser,
    }
    const mcp = createMcpHandler(stubRelay)

    const badPayloads = [
      {
        baseRev: 0,
        summary: 'zero rev',
        operations: [{ type: 'rename_node', id: 'a', title: 'B' }],
      },
      {
        baseRev: 1.5,
        summary: 'float rev',
        operations: [{ type: 'rename_node', id: 'a', title: 'B' }],
      },
      { baseRev: 1, summary: 'move missing dest', operations: [{ type: 'move_node', id: 'a' }] },
      {
        baseRev: 1,
        summary: 'add missing title',
        operations: [{ type: 'add_node', parentId: 'root' }],
      },
      {
        baseRev: 1,
        summary: 'notes not string',
        operations: [{ type: 'update_notes', id: 'a', notes: 123 }],
      },
      { baseRev: 1, summary: 'unknown op', operations: [{ type: 'delete_all', id: 'a' }] },
    ]

    for (const [idx, args] of badPayloads.entries()) {
      const res = (await mcp.handleMessage({
        jsonrpc: '2.0',
        id: idx + 1,
        method: 'tools/call',
        params: { name: 'propose_edits', arguments: args },
      })) as { result: { isError?: boolean; content: { text: string }[] } }
      expect(res.result.isError).toBe(true)
      expect(res.result.content[0]!.text).toContain('INVALID_ARGS')
    }
    expect(callBrowser).not.toHaveBeenCalled()
  })

  it('redacts configured pairing tokens and controls generated token printing in startup banner', () => {
    const info = { host: '127.0.0.1' as const, port: 4317, token: 'super-secret-value' }

    // Configured tokens are never printed even in TTY or with --print-token
    const configured = formatStartupBanner(info, {
      configuredToken: true,
      printToken: true,
      isTTY: true,
    })
    expect(configured).not.toContain('super-secret-value')
    expect(configured).toContain('<configured>')

    // Generated token is omitted when non-TTY without --print-token
    const nonTty = formatStartupBanner(info, {
      configuredToken: false,
      printToken: false,
      isTTY: false,
    })
    expect(nonTty).not.toContain('super-secret-value')
    expect(nonTty).toContain('--print-token')

    // Generated token is shown when --print-token or TTY is active
    expect(
      formatStartupBanner(info, { configuredToken: false, printToken: true, isTTY: false }),
    ).toContain('super-secret-value')
    expect(
      formatStartupBanner(info, { configuredToken: false, printToken: false, isTTY: true }),
    ).toContain('super-secret-value')
  })
})
