import { createInterface } from 'node:readline'

export const PROTOCOL_VERSION = '2025-03-26'

export const TOOLS = [
  {
    name: 'mindmap_status',
    description:
      'Check whether a Mind Map Studio browser tab is paired, which project is bound, the current access mode, and the current map revision.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_map',
    description:
      'Read the paired project map with stable node IDs and the current baseRev for proposing edits.',
    inputSchema: {
      type: 'object',
      properties: {
        includeNotes: {
          type: 'boolean',
          description: 'Whether to include node notes text (default true).',
        },
        maxDepth: {
          type: 'integer',
          minimum: 0,
          description: 'Optional depth cap starting at 0 for the root node.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_node',
    description:
      'Read full details, notes, parent ID, and direct child summaries for one node by its stable ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Stable TreeNode.id of the node.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_nodes',
    description:
      'Search titles, notes, and tags in the paired map and return matching stable node IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'Case-insensitive search text.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Max matches (default 25).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_edits',
    description:
      'Propose a batch of map edits (add_node, rename_node, move_node, update_notes) against baseRev for human review and atomic application.',
    inputSchema: {
      type: 'object',
      properties: {
        baseRev: {
          type: 'integer',
          minimum: 1,
          description: 'Revision number returned by get_map / get_node / search_nodes.',
        },
        summary: {
          type: 'string',
          minLength: 1,
          description: 'Short human-readable summary of what this batch changes.',
        },
        operations: {
          type: 'array',
          minItems: 1,
          items: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  type: { const: 'add_node' },
                  parentId: { type: 'string', minLength: 1 },
                  id: { type: 'string', minLength: 1 },
                  title: { type: 'string', minLength: 1 },
                  notes: { type: 'string' },
                  index: { type: 'integer', minimum: 0 },
                },
                required: ['type', 'parentId', 'title'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  type: { const: 'rename_node' },
                  id: { type: 'string', minLength: 1 },
                  title: { type: 'string', minLength: 1 },
                },
                required: ['type', 'id', 'title'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  type: { const: 'move_node' },
                  id: { type: 'string', minLength: 1 },
                  newParentId: { type: 'string', minLength: 1 },
                  index: { type: 'integer', minimum: 0 },
                },
                required: ['type', 'id', 'newParentId'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  type: { const: 'update_notes' },
                  id: { type: 'string', minLength: 1 },
                  notes: { type: 'string' },
                },
                required: ['type', 'id', 'notes'],
                additionalProperties: false,
              },
            ],
          },
        },
      },
      required: ['baseRev', 'summary', 'operations'],
      additionalProperties: false,
    },
  },
]

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeSafeInt(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function validateOperation(op, index) {
  if (!isPlainObject(op)) {
    return `operations[${index}] must be an object.`
  }
  switch (op.type) {
    case 'add_node':
      if (!isNonEmptyString(op.parentId)) {
        return `operations[${index}] (add_node) requires a non-empty string parentId.`
      }
      if (!isNonEmptyString(op.title)) {
        return `operations[${index}] (add_node) requires a non-empty string title.`
      }
      if (op.id !== undefined && !isNonEmptyString(op.id)) {
        return `operations[${index}] (add_node) id must be a non-empty string when provided.`
      }
      if (op.notes !== undefined && typeof op.notes !== 'string') {
        return `operations[${index}] (add_node) notes must be a string when provided.`
      }
      if (op.index !== undefined && !isNonNegativeSafeInt(op.index)) {
        return `operations[${index}] (add_node) index must be a non-negative integer.`
      }
      return null

    case 'rename_node':
      if (!isNonEmptyString(op.id)) {
        return `operations[${index}] (rename_node) requires a non-empty string id.`
      }
      if (!isNonEmptyString(op.title)) {
        return `operations[${index}] (rename_node) requires a non-empty string title.`
      }
      return null

    case 'move_node':
      if (!isNonEmptyString(op.id)) {
        return `operations[${index}] (move_node) requires a non-empty string id.`
      }
      if (!isNonEmptyString(op.newParentId)) {
        return `operations[${index}] (move_node) requires a non-empty string newParentId.`
      }
      if (op.index !== undefined && !isNonNegativeSafeInt(op.index)) {
        return `operations[${index}] (move_node) index must be a non-negative integer.`
      }
      return null

    case 'update_notes':
      if (!isNonEmptyString(op.id)) {
        return `operations[${index}] (update_notes) requires a non-empty string id.`
      }
      if (typeof op.notes !== 'string') {
        return `operations[${index}] (update_notes) requires a string notes field.`
      }
      return null

    default:
      return `operations[${index}] has unsupported type "${String(op.type)}".`
  }
}

function toolOk(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  }
}

function toolErr(code, message, extra = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: { code, message, ...extra } }) }],
    isError: true,
  }
}

function errorResponse(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

/**
 * Create a JSON-RPC 2.0 MCP message handler backed by a `BridgeRelay`.
 */
export function createMcpHandler(relay) {
  async function handleToolCall(name, args) {
    switch (name) {
      case 'mindmap_status':
        return toolOk(relay.getStatus())

      case 'get_map':
        return toolOk(await relay.callBrowser('get_map', args))

      case 'get_node': {
        if (typeof args.id !== 'string' || !args.id.trim()) {
          return toolErr('INVALID_ARGS', 'get_node requires a non-empty string id.')
        }
        return toolOk(await relay.callBrowser('get_node', args))
      }

      case 'search_nodes': {
        if (typeof args.query !== 'string' || !args.query.trim()) {
          return toolErr('INVALID_ARGS', 'search_nodes requires a non-empty string query.')
        }
        return toolOk(await relay.callBrowser('search_nodes', args))
      }

      case 'propose_edits': {
        const status = relay.getStatus()
        if (!status.connected) {
          return toolErr('NOT_CONNECTED', 'No Mind Map Studio tab is paired with the bridge.')
        }
        if (status.mode === 'read-only') {
          return toolErr(
            'READ_ONLY',
            'The paired project is currently in read-only mode; ask the user to allow edits.',
          )
        }
        if (!Number.isSafeInteger(args.baseRev) || args.baseRev < 1) {
          return toolErr(
            'INVALID_ARGS',
            'propose_edits requires baseRev as a positive integer >= 1.',
          )
        }
        if (typeof args.summary !== 'string' || !args.summary.trim()) {
          return toolErr('INVALID_ARGS', 'propose_edits requires a non-empty summary.')
        }
        if (!Array.isArray(args.operations) || args.operations.length === 0) {
          return toolErr('INVALID_ARGS', 'propose_edits requires a non-empty operations array.')
        }
        for (let i = 0; i < args.operations.length; i++) {
          const opError = validateOperation(args.operations[i], i)
          if (opError) {
            return toolErr('INVALID_ARGS', opError)
          }
        }
        return toolOk(await relay.callBrowser('propose_edits', args))
      }

      default:
        return toolErr('UNKNOWN_TOOL', `Unknown tool: ${name}`)
    }
  }

  return {
    async handleMessage(msg) {
      if (!isPlainObject(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        const id = isPlainObject(msg) && msg.id !== undefined ? msg.id : null
        return id === null ? null : errorResponse(id, -32600, 'Invalid Request')
      }

      const { id, method, params } = msg

      // Notifications have no id and expect no reply.
      if (
        id === undefined ||
        method === 'notifications/initialized' ||
        method.startsWith('notifications/')
      ) {
        return null
      }

      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: {} },
              serverInfo: { name: 'mindmap-studio-bridge', version: '1.0.0' },
            },
          }

        case 'ping':
          return { jsonrpc: '2.0', id, result: {} }

        case 'tools/list':
          return { jsonrpc: '2.0', id, result: { tools: TOOLS } }

        case 'tools/call': {
          if (!isPlainObject(params) || typeof params.name !== 'string') {
            return errorResponse(id, -32602, 'Invalid params: expected tool name')
          }
          const args = isPlainObject(params.arguments) ? params.arguments : {}
          try {
            const result = await handleToolCall(params.name, args)
            return { jsonrpc: '2.0', id, result }
          } catch (error) {
            const code =
              error && typeof error === 'object' && typeof error.code === 'string'
                ? error.code
                : 'BRIDGE_ERROR'
            const message = error instanceof Error ? error.message : String(error)
            return { jsonrpc: '2.0', id, result: toolErr(code, message) }
          }
        }

        default:
          return errorResponse(id, -32601, `Method not found: ${method}`)
      }
    },
  }
}

/**
 * Serve newline-delimited JSON-RPC 2.0 MCP traffic over `input` and `output`.
 * Never writes anything other than JSON-RPC frames to `output`.
 */
export function serveStdio(handler, input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input, crlfDelay: Infinity })

  const done = new Promise((resolve) => {
    const inflight = new Set()

    function writeLine(payload) {
      if (output.writable && !output.destroyed) {
        output.write(`${JSON.stringify(payload)}\n`)
      }
    }

    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      let msg
      try {
        msg = JSON.parse(trimmed)
      } catch {
        writeLine(errorResponse(null, -32700, 'Parse error'))
        return
      }

      const task = handler
        .handleMessage(msg)
        .then((response) => {
          if (response !== null) writeLine(response)
        })
        .catch((error) => {
          const id = isPlainObject(msg) && msg.id !== undefined ? msg.id : null
          if (id !== null) {
            writeLine(
              errorResponse(id, -32603, error instanceof Error ? error.message : String(error)),
            )
          }
        })
        .finally(() => {
          inflight.delete(task)
        })
      inflight.add(task)
    })

    rl.on('close', () => {
      void Promise.allSettled(inflight).then(() => resolve())
    })
  })

  return {
    done,
    close: () => rl.close(),
  }
}
