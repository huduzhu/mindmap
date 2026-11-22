import { flushPendingEdits } from '../store/pendingEdits'
import { useProjects } from '../store/projects'
import { newId } from '../store/treeOps'
import { DEFAULT_BADGE_STATE, useCoeditBadge } from './badgeStore'
import { searchNodesForAgent, serializeMapForAgent, serializeNodeForAgent } from './serialize'
import { useCoedit } from './session'
import type { CoeditBatch, CoeditMode, CoeditOp } from './types'

export type CoeditConnectErrorCode =
  | 'invalid_port'
  | 'empty_token'
  | 'no_project'
  | 'invalid_token'
  | 'already_paired'
  | 'connection_failed'

export class CoeditConnectionError extends Error {
  readonly code: CoeditConnectErrorCode

  constructor(code: CoeditConnectErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface ConnectBridgeOptions {
  port: number
  token: string
  mode: CoeditMode
  agentName?: string
  connectTimeoutMs?: number
}

interface BridgeRpcMessage {
  type?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
  resumeSecret?: unknown
  serverNonce?: unknown
  proof?: unknown
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

let activeSocket: WebSocket | null = null
let activePort: number | null = null
let unsubscribeProjects: (() => void) | null = null
let unsubscribeCoedit: (() => void) | null = null
let connectionSeq = 0
let cancelPendingConnection: (() => void) | null = null
let retryTimer: number | undefined
let unsubscribeRetryProject: (() => void) | undefined
const retryDelays = [500, 1000, 2000, 4000, 8000, 8000] as const

function stopRetry(): void {
  window.clearTimeout(retryTimer)
  retryTimer = undefined
  unsubscribeRetryProject?.()
  unsubscribeRetryProject = undefined
}

function retryBridge(
  options: ConnectBridgeOptions,
  projectId: string,
  resumeSecret: string,
  attempt = 0,
): void {
  const delay = retryDelays[attempt]
  if (delay === undefined || useProjects.getState().currentId !== projectId) {
    disconnectBridge()
    return
  }
  if (!unsubscribeRetryProject) {
    unsubscribeRetryProject = useProjects.subscribe(({ currentId }) => {
      if (currentId !== projectId) disconnectBridge()
    })
  }
  retryTimer = window.setTimeout(() => {
    const seq = connectionSeq
    void openBridge({ ...options, mode: useCoedit.getState().mode }, projectId, resumeSecret).catch(
      (error) => {
        if (connectionSeq !== seq + 1) return
        if (error instanceof CoeditConnectionError && error.code === 'connection_failed') {
          retryBridge(options, projectId, resumeSecret, attempt + 1)
        } else {
          disconnectBridge()
        }
      },
    )
  }, delay)
}

function resetBadge(): void {
  useCoeditBadge.setState({ ...DEFAULT_BADGE_STATE })
}

function syncBadgeFromSession(): void {
  const s = useCoedit.getState()
  if (!s.projectId) {
    resetBadge()
    return
  }
  useCoeditBadge.setState({
    connected: true,
    pendingCount: s.pendingBatches.length,
    mode: s.mode,
    agentName: s.agentName,
    projectId: s.projectId,
  })
}

function cleanupConnection(): void {
  if (unsubscribeProjects) {
    unsubscribeProjects()
    unsubscribeProjects = null
  }
  if (unsubscribeCoedit) {
    unsubscribeCoedit()
    unsubscribeCoedit = null
  }
  activeSocket = null
  activePort = null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const ALLOWED_TOP_FIELDS: readonly string[] = ['baseRev', 'summary', 'operations']

const ALLOWED_OP_FIELDS: Record<string, readonly string[]> = {
  add_node: ['type', 'parentId', 'id', 'title', 'notes', 'index'],
  rename_node: ['type', 'id', 'title'],
  move_node: ['type', 'id', 'newParentId', 'index'],
  update_notes: ['type', 'id', 'notes'],
}

export function validateProposalParams(params: Record<string, unknown>):
  | {
      ok: true
      baseRev: number
      summary: string
      operations: CoeditOp[]
    }
  | { ok: false; message: string } {
  if (Object.keys(params).some((key) => !ALLOWED_TOP_FIELDS.includes(key))) {
    return { ok: false, message: 'propose_edits does not accept additional fields.' }
  }
  const baseRev = params.baseRev
  if (typeof baseRev !== 'number' || !Number.isSafeInteger(baseRev) || baseRev < 1) {
    return { ok: false, message: 'propose_edits requires a positive integer baseRev.' }
  }
  const summary = params.summary
  if (!isNonEmptyString(summary)) {
    return { ok: false, message: 'propose_edits requires a non-empty summary.' }
  }
  const ops = params.operations
  if (!Array.isArray(ops) || ops.length === 0) {
    return { ok: false, message: 'propose_edits requires a non-empty operations array.' }
  }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (!isPlainObject(op)) {
      return { ok: false, message: `operations[${i}] must be an object.` }
    }
    const opType = op.type
    if (typeof opType !== 'string') {
      return { ok: false, message: `operations[${i}] must have a string type.` }
    }
    const allowed = Object.hasOwn(ALLOWED_OP_FIELDS, opType) ? ALLOWED_OP_FIELDS[opType] : undefined
    if (allowed && Object.keys(op).some((key) => !allowed.includes(key))) {
      return { ok: false, message: `operations[${i}] contains unexpected fields.` }
    }
    switch (opType) {
      case 'add_node':
        if (!isNonEmptyString(op.parentId) || !isNonEmptyString(op.title)) {
          return { ok: false, message: `operations[${i}] (add_node) needs parentId and title.` }
        }
        if (op.id !== undefined && !isNonEmptyString(op.id)) {
          return { ok: false, message: `operations[${i}] (add_node) invalid id.` }
        }
        if (op.notes !== undefined && typeof op.notes !== 'string') {
          return { ok: false, message: `operations[${i}] (add_node) notes must be string.` }
        }
        if (
          op.index !== undefined &&
          (typeof op.index !== 'number' || !Number.isSafeInteger(op.index) || op.index < 0)
        ) {
          return { ok: false, message: `operations[${i}] (add_node) invalid index.` }
        }
        break
      case 'rename_node':
        if (!isNonEmptyString(op.id) || !isNonEmptyString(op.title)) {
          return { ok: false, message: `operations[${i}] (rename_node) needs id and title.` }
        }
        break
      case 'move_node':
        if (!isNonEmptyString(op.id) || !isNonEmptyString(op.newParentId)) {
          return { ok: false, message: `operations[${i}] (move_node) needs id and newParentId.` }
        }
        if (
          op.index !== undefined &&
          (typeof op.index !== 'number' || !Number.isSafeInteger(op.index) || op.index < 0)
        ) {
          return { ok: false, message: `operations[${i}] (move_node) invalid index.` }
        }
        break
      case 'update_notes':
        if (!isNonEmptyString(op.id) || typeof op.notes !== 'string') {
          return { ok: false, message: `operations[${i}] (update_notes) needs id and notes.` }
        }
        break
      default:
        return { ok: false, message: `operations[${i}] has unsupported type.` }
    }
  }
  return {
    ok: true,
    baseRev,
    summary: summary.trim(),
    operations: ops as unknown as CoeditOp[],
  }
}

export function getCoeditConnectionInfo(): { port: number; agentName: string | null } | null {
  const s = useCoedit.getState()
  if (!s.projectId || activePort === null) return null
  return { port: activePort, agentName: s.agentName }
}

export function setBridgeMode(mode: CoeditMode): void {
  const coedit = useCoedit.getState()
  if (!coedit.projectId) return
  coedit.setMode(mode)
  syncBadgeFromSession()
  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    const rev = useCoedit.getState().tracker?.rev ?? 1
    activeSocket.send(JSON.stringify({ type: 'state', mode, rev }))
  }
}

export function cancelBridgePairing(): void {
  if (!unsubscribeRetryProject) cancelPendingConnection?.()
}

export function disconnectBridge(): void {
  connectionSeq += 1
  stopRetry()
  cancelPendingConnection?.()
  const socket = activeSocket
  cleanupConnection()
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'disconnect' }))
      socket.close(1000, 'Disconnected')
    } catch {
      // Socket may already be closing.
    }
  } else if (socket && socket.readyState === WebSocket.CONNECTING) {
    try {
      socket.close()
    } catch {
      // Ignore close while connecting.
    }
  }
  useCoedit.getState().disconnect()
  resetBadge()
}

export function connectToBridge(options: ConnectBridgeOptions): Promise<void> {
  return openBridge(options)
}

function openBridge(
  options: ConnectBridgeOptions,
  resumeProjectId?: string,
  resumeSecret?: string,
): Promise<void> {
  const { port, token, mode, agentName = 'Hermes', connectTimeoutMs = 5_000 } = options
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return Promise.reject(
      new CoeditConnectionError('invalid_port', 'Bridge port must be between 1 and 65535.'),
    )
  }
  const trimmedToken = token.trim()
  if (!trimmedToken) {
    return Promise.reject(
      new CoeditConnectionError('empty_token', 'Enter the pairing token from the bridge.'),
    )
  }
  const { currentId, current } = useProjects.getState()
  if (!currentId || !current || (resumeProjectId && currentId !== resumeProjectId)) {
    return Promise.reject(new CoeditConnectionError('no_project', 'Open a project before pairing.'))
  }

  if (!resumeProjectId) disconnectBridge()
  const mySeq = ++connectionSeq
  const boundProjectId = currentId

  return new Promise((resolve, reject) => {
    let settled = false
    let welcomed = false
    let resumeNonce: string | undefined
    let resumeVerified = false
    let ws: WebSocket
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    } catch {
      reject(new CoeditConnectionError('connection_failed', 'Could not open bridge socket.'))
      return
    }

    const timer = window.setTimeout(() => {
      abortPairing('Timed out connecting to bridge.')
    }, connectTimeoutMs)

    const cancel = () => abortPairing('Pairing cancelled.')
    cancelPendingConnection = cancel

    function clearPendingConnection() {
      window.clearTimeout(timer)
      if (cancelPendingConnection === cancel) cancelPendingConnection = null
    }

    function finishReject(code: CoeditConnectErrorCode, message: string) {
      if (settled) return
      settled = true
      clearPendingConnection()
      reject(new CoeditConnectionError(code, message))
    }

    function abortPairing(message: string) {
      if (settled) return
      finishReject('connection_failed', message)
      ws.close()
    }

    function sendRpcError(id: string, code: string, message: string) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'rpc_result', id, ok: false, error: { code, message } }))
      }
    }

    ws.addEventListener('open', () => {
      if (mySeq !== connectionSeq) {
        ws.close()
        return
      }
      if (resumeProjectId) {
        resumeNonce = hex(crypto.getRandomValues(new Uint8Array(32)))
        ws.send(JSON.stringify({ type: 'resume_challenge', nonce: resumeNonce }))
        return
      }
      ws.send(
        JSON.stringify({
          type: 'hello',
          supportsResume: Boolean(crypto.subtle),
          token: trimmedToken,
          projectId: boundProjectId,
          projectName: current.name,
          mode,
          rev: 1,
        }),
      )
    })

    ws.addEventListener('message', (event) => {
      if (mySeq !== connectionSeq || (settled && !welcomed)) return
      let msg: BridgeRpcMessage
      try {
        msg = JSON.parse(String(event.data)) as BridgeRpcMessage
      } catch {
        return
      }

      if (!welcomed) {
        if (resumeProjectId && !resumeVerified) {
          const { serverNonce, proof } = msg
          if (
            msg.type !== 'resume_proof' ||
            !resumeNonce ||
            typeof serverNonce !== 'string' ||
            !/^[0-9a-f]{64}$/.test(serverNonce) ||
            typeof proof !== 'string' ||
            !/^[0-9a-f]{64}$/.test(proof)
          ) {
            finishReject('invalid_token', 'Could not verify the bridge.')
            ws.close()
            return
          }
          const nonces = [resumeNonce, serverNonce]
          resumeNonce = undefined
          const encoder = new TextEncoder()
          void (async () => {
            const key = await crypto.subtle.importKey(
              'raw',
              encoder.encode(resumeSecret),
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign', 'verify'],
            )
            const signature = Uint8Array.from(proof.match(/../g) ?? [], (pair) =>
              parseInt(pair, 16),
            )
            if (
              !(await crypto.subtle.verify(
                'HMAC',
                key,
                signature,
                encoder.encode(JSON.stringify(['mindmap-bridge-v1', ...nonces])),
              ))
            ) {
              throw new Error('Could not verify the bridge.')
            }
            if (mySeq !== connectionSeq || settled) return
            flushPendingEdits()
            const tracker = useCoedit.getState().syncFromCurrentTree()
            const latest = useProjects.getState()
            if (!tracker || !latest.current || latest.currentId !== boundProjectId) return
            const projectName = latest.current.name
            const resumeMode = useCoedit.getState().mode
            const rev = tracker.rev
            const signed = await crypto.subtle.sign(
              'HMAC',
              key,
              encoder.encode(
                JSON.stringify([
                  'mindmap-browser-v1',
                  ...nonces,
                  boundProjectId,
                  projectName,
                  resumeMode,
                  rev,
                ]),
              ),
            )
            if (mySeq !== connectionSeq || settled || ws.readyState !== WebSocket.OPEN) return
            resumeVerified = true
            ws.send(
              JSON.stringify({
                type: 'resume_hello',
                projectId: boundProjectId,
                projectName,
                mode: resumeMode,
                rev,
                proof: hex(new Uint8Array(signed)),
              }),
            )
          })().catch(() => {
            if (mySeq !== connectionSeq || settled) return
            finishReject('invalid_token', 'Could not verify the bridge.')
            ws.close()
          })
          return
        }
        if (msg.type !== 'welcome') return
        if (
          !resumeProjectId &&
          typeof msg.resumeSecret === 'string' &&
          /^[0-9a-f]{64}$/.test(msg.resumeSecret)
        ) {
          resumeSecret = msg.resumeSecret
        }
        const latest = useProjects.getState()
        if (latest.currentId !== boundProjectId || !latest.current) {
          ws.close(1000, 'Project changed')
          finishReject('no_project', 'Project closed while connecting.')
          return
        }
        const ready = resumeProjectId
          ? useCoedit.getState().syncFromCurrentTree() !== null
          : useCoedit.getState().startSession(boundProjectId, agentName, mode)
        if (!ready) {
          ws.close(1000, 'Session failed')
          finishReject('connection_failed', 'Could not start co-editing session.')
          return
        }

        welcomed = true
        clearPendingConnection()
        stopRetry()
        activeSocket = ws
        useCoeditBadge.setState({ reconnecting: false })
        activePort = port
        syncBadgeFromSession()

        let lastSentRev = resumeProjectId ? -1 : 1
        let lastSentMode = mode
        let lastSentName = latest.current.name

        const pushStateIfChanged = () => {
          if (ws.readyState !== WebSocket.OPEN) return
          const coeditState = useCoedit.getState()
          const projState = useProjects.getState()
          if (!coeditState.projectId || !projState.current) return
          const nextRev = coeditState.tracker?.rev ?? lastSentRev
          const nextMode = coeditState.mode
          const nextName = projState.current.name
          if (nextRev !== lastSentRev || nextMode !== lastSentMode || nextName !== lastSentName) {
            lastSentRev = nextRev
            lastSentMode = nextMode
            lastSentName = nextName
            ws.send(
              JSON.stringify({
                type: 'state',
                mode: nextMode,
                rev: nextRev,
                projectName: nextName,
              }),
            )
          }
        }

        unsubscribeProjects = useProjects.subscribe((state, prev) => {
          if (state.currentId !== boundProjectId || !state.current) {
            disconnectBridge()
            return
          }
          if (state.current.map !== prev.current?.map) {
            useCoedit.getState().syncFromCurrentTree()
          }
          pushStateIfChanged()
        })

        unsubscribeCoedit = useCoedit.subscribe(() => {
          syncBadgeFromSession()
          pushStateIfChanged()
        })

        pushStateIfChanged()
        settled = true
        resolve()
        return
      }

      if (msg.type !== 'rpc' || typeof msg.id !== 'string' || typeof msg.method !== 'string') {
        return
      }

      const rpcId = msg.id
      const rpcMethod = msg.method
      const rpcParams = isPlainObject(msg.params) ? msg.params : {}

      if (useProjects.getState().currentId !== boundProjectId) {
        sendRpcError(rpcId, 'NOT_CONNECTED', 'Paired project is no longer open.')
        disconnectBridge()
        return
      }

      flushPendingEdits()
      const tracker = useCoedit.getState().syncFromCurrentTree()
      const latestProject = useProjects.getState().current
      if (!tracker || !latestProject) {
        sendRpcError(rpcId, 'NOT_CONNECTED', 'Co-edit session is not active.')
        disconnectBridge()
        return
      }

      switch (rpcMethod) {
        case 'get_map': {
          const mapOptions: { includeNotes?: boolean; maxDepth?: number } = {}
          if (typeof rpcParams.includeNotes === 'boolean') {
            mapOptions.includeNotes = rpcParams.includeNotes
          }
          if (typeof rpcParams.maxDepth === 'number' && Number.isFinite(rpcParams.maxDepth)) {
            mapOptions.maxDepth = rpcParams.maxDepth
          }
          const payload = serializeMapForAgent(latestProject, tracker.rev, mapOptions)
          ws.send(JSON.stringify({ type: 'rpc_result', id: rpcId, ok: true, result: payload }))
          break
        }

        case 'get_node': {
          const nodeId = typeof rpcParams.id === 'string' ? rpcParams.id : ''
          const detail = serializeNodeForAgent(latestProject.map, nodeId, tracker.rev)
          if (!detail) {
            sendRpcError(rpcId, 'NODE_NOT_FOUND', `Node "${nodeId}" not found.`)
            break
          }
          ws.send(JSON.stringify({ type: 'rpc_result', id: rpcId, ok: true, result: detail }))
          break
        }

        case 'search_nodes': {
          const query = typeof rpcParams.query === 'string' ? rpcParams.query : ''
          const limit =
            typeof rpcParams.limit === 'number' && Number.isFinite(rpcParams.limit)
              ? rpcParams.limit
              : undefined
          const results = searchNodesForAgent(latestProject.map, query, tracker.rev, limit)
          ws.send(JSON.stringify({ type: 'rpc_result', id: rpcId, ok: true, result: results }))
          break
        }

        case 'propose_edits': {
          const validated = validateProposalParams(rpcParams)
          if (!validated.ok) {
            sendRpcError(rpcId, 'INVALID_ARGS', validated.message)
            break
          }
          const batch: CoeditBatch = {
            id: newId(),
            agentName: useCoedit.getState().agentName ?? agentName,
            baseRev: validated.baseRev,
            summary: validated.summary,
            operations: validated.operations,
            createdAt: new Date().toISOString(),
          }
          const enqueueRes = useCoedit.getState().enqueueBatch(batch, boundProjectId)
          if (!enqueueRes.accepted) {
            sendRpcError(
              rpcId,
              enqueueRes.reason.toUpperCase(),
              `Cannot queue edits: ${enqueueRes.reason}`,
            )
            break
          }
          ws.send(
            JSON.stringify({
              type: 'rpc_result',
              id: rpcId,
              ok: true,
              result: {
                queued: true,
                batchId: batch.id,
                baseRev: batch.baseRev,
                pendingCount: useCoedit.getState().pendingBatches.length,
              },
            }),
          )
          break
        }

        default:
          sendRpcError(rpcId, 'UNKNOWN_METHOD', `Unsupported RPC method: ${rpcMethod}`)
          break
      }
    })

    ws.addEventListener('close', (event) => {
      if (mySeq !== connectionSeq) return
      if (!welcomed) {
        cleanupConnection()
        const code =
          event.code === 4001
            ? 'invalid_token'
            : event.code === 4009
              ? 'already_paired'
              : 'connection_failed'
        finishReject(code, event.reason || 'Bridge connection closed.')
        return
      }
      cleanupConnection()
      if (crypto.subtle && resumeSecret && [1001, 1006, 1012, 1013].includes(event.code)) {
        // Keep revision history for conflict checks, but discard unapproved work.
        useCoedit.setState({ pendingBatches: [] })
        useCoeditBadge.setState({ reconnecting: true, connected: false, pendingCount: 0 })
        retryBridge(options, boundProjectId, resumeSecret)
      } else {
        disconnectBridge()
      }
    })

    ws.addEventListener('error', () => {
      if (mySeq !== connectionSeq) return
      if (!welcomed) {
        cleanupConnection()
        finishReject('connection_failed', 'Could not reach local bridge.')
      }
    })
  })
}
