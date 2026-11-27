import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { acceptWebSocket } from './ws.mjs'

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://huduzhu.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false
  }
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

function isAllowedOrigin(origin, allowedSet) {
  return typeof origin === 'string' && allowedSet.has(origin)
}

function makeError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function rejectUpgrade(socket, status, reason) {
  if (!socket.destroyed && socket.writable) {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  }
  socket.destroy()
}

function parsePathname(rawUrl) {
  try {
    return new URL(rawUrl ?? '/', 'http://127.0.0.1').pathname
  } catch {
    return null
  }
}

function isValidMode(mode) {
  return mode === 'read-only' || mode === 'approve-writes'
}

/**
 * Loopback HTTP + WebSocket relay bound strictly to `127.0.0.1`.
 * Holds at most one paired Mind Map Studio tab session at a time.
 */
export function createBridgeRelay(options = {}) {
  const requestedPort = options.port ?? 4317
  const token =
    typeof options.token === 'string' && options.token.length > 0
      ? options.token
      : randomBytes(24).toString('base64url')
  const requestTimeoutMs = options.requestTimeoutMs ?? 15_000
  const helloTimeoutMs = options.helloTimeoutMs ?? 5_000
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...(options.extraOrigins ?? [])])

  let session = null
  let resumeCredential = null
  let rpcSeq = 0
  const pendingRpcs = new Map()
  const activeSockets = new Set()

  function failAllPending(code, message) {
    for (const [id, pending] of pendingRpcs) {
      clearTimeout(pending.timer)
      pending.reject(makeError(code, message))
      pendingRpcs.delete(id)
    }
  }

  function clearSession(ws) {
    if (session && (!ws || session.ws === ws)) {
      session = null
      failAllPending('DISCONNECTED', 'Browser session disconnected')
    }
  }

  const server = createServer((req, res) => {
    const origin = req.headers.origin
    const pathname = parsePathname(req.url)
    if (!pathname) {
      res.writeHead(400, { Connection: 'close' })
      res.end()
      return
    }

    if (req.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, allowedOrigins)) {
        res.writeHead(403, { Connection: 'close' })
        res.end()
        return
      }
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Private-Network': 'true',
        Vary: 'Origin',
      })
      res.end()
      return
    }

    if (req.method === 'GET' && pathname === '/health') {
      if (origin !== undefined && !isAllowedOrigin(origin, allowedOrigins)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'origin_not_allowed' }))
        return
      }
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      }
      if (origin !== undefined) {
        headers['Access-Control-Allow-Origin'] = origin
        headers['Access-Control-Allow-Private-Network'] = 'true'
        headers.Vary = 'Origin'
      }
      res.writeHead(200, headers)
      res.end(
        JSON.stringify({
          ok: true,
          protocolVersion: 1,
          connected: Boolean(session),
        }),
      )
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: 'not_found' }))
  })

  server.on('upgrade', (req, socket, head) => {
    const pathname = parsePathname(req.url)
    if (pathname !== '/ws') {
      rejectUpgrade(socket, 404, 'Not Found')
      return
    }

    const origin = req.headers.origin
    if (!isAllowedOrigin(origin, allowedOrigins)) {
      rejectUpgrade(socket, 403, 'Forbidden')
      return
    }

    const ws = acceptWebSocket(req, socket, head)
    if (!ws) {
      rejectUpgrade(socket, 400, 'Bad Request')
      return
    }

    activeSockets.add(ws)
    let paired = false
    let resumeChallenge = null
    const helloTimer = setTimeout(() => {
      if (!paired) ws.close(4008, 'Hello timeout')
    }, helloTimeoutMs)
    helloTimer.unref()

    ws.onMessage((raw) => {
      let msg
      try {
        msg = JSON.parse(raw)
      } catch {
        ws.close(1007, 'Invalid JSON')
        return
      }
      if (!msg || typeof msg !== 'object') {
        ws.close(1007, 'Invalid message')
        return
      }

      if (!paired) {
        if (msg.type === 'resume_challenge' && resumeChallenge === null) {
          if (!resumeCredential || resumeCredential.origin !== origin) {
            ws.close(4001, 'Pair again to resume')
            return
          }
          if (typeof msg.nonce !== 'string' || !/^[0-9a-f]{64}$/.test(msg.nonce)) {
            ws.close(4002, 'Invalid resume challenge')
            return
          }
          const serverNonce = randomBytes(32).toString('hex')
          const lastRev = resumeCredential.rev
          resumeChallenge = { nonces: [msg.nonce, serverNonce], credential: resumeCredential }
          const cold = msg.version === 2
          const proof = createHmac('sha256', resumeCredential.secret)
            .update(
              JSON.stringify(
                cold
                  ? ['mindmap-bridge-v2', ...resumeChallenge.nonces, lastRev]
                  : ['mindmap-bridge-v1', ...resumeChallenge.nonces],
              ),
            )
            .digest('hex')
          ws.sendText(
            JSON.stringify({
              type: 'resume_proof',
              serverNonce,
              proof,
              ...(cold ? { lastRev } : {}),
            }),
          )
          return
        }
        clearTimeout(helloTimer)
        if (msg.type !== 'hello' && msg.type !== 'resume_hello') {
          ws.close(4002, 'Expected hello')
          return
        }
        if (
          typeof msg.projectId !== 'string' ||
          !msg.projectId.trim() ||
          !isValidMode(msg.mode) ||
          (msg.projectName !== undefined && typeof msg.projectName !== 'string') ||
          (msg.type === 'resume_hello' &&
            (msg.projectId.length > 128 ||
              typeof msg.projectName !== 'string' ||
              msg.projectName.length > 512 ||
              !Number.isSafeInteger(msg.rev) ||
              msg.rev < 1 ||
              typeof msg.proof !== 'string' ||
              !/^[0-9a-f]{64}$/.test(msg.proof)))
        ) {
          ws.close(4002, 'Invalid hello payload')
          return
        }
        const proven =
          msg.type === 'resume_hello' &&
          resumeChallenge &&
          resumeChallenge.credential === resumeCredential &&
          msg.projectId === resumeCredential.projectId &&
          origin === resumeCredential.origin &&
          msg.rev >= resumeCredential.rev
            ? tokensMatch(
                msg.proof,
                createHmac('sha256', resumeCredential.secret)
                  .update(
                    JSON.stringify([
                      'mindmap-browser-v1',
                      ...resumeChallenge.nonces,
                      msg.projectId,
                      msg.projectName,
                      msg.mode,
                      msg.rev,
                    ]),
                  )
                  .digest('hex'),
              )
            : msg.type === 'hello' && tokensMatch(msg.token, token)
        if (!proven) {
          ws.close(4001, 'Invalid pairing token')
          return
        }

        if (session !== null) {
          ws.close(4009, 'already_paired')
          return
        }

        paired = true
        session = {
          ws,
          projectId: msg.projectId,
          projectName: msg.projectName ?? msg.projectId,
          mode: msg.mode,
          rev: typeof msg.rev === 'number' && Number.isFinite(msg.rev) ? msg.rev : 1,
        }
        if (msg.type === 'hello') {
          resumeCredential =
            msg.supportsResume === true
              ? {
                  projectId: msg.projectId,
                  origin,
                  rev: session.rev,
                  secret: randomBytes(32).toString('hex'),
                }
              : null
        }
        if (resumeCredential) resumeCredential.rev = session.rev
        ws.sendText(
          JSON.stringify({
            type: 'welcome',
            protocolVersion: 1,
            ...(msg.type === 'hello' && resumeCredential
              ? { resumeSecret: resumeCredential.secret, rememberedPairingVersion: 2 }
              : {}),
          }),
        )
        return
      }

      if (!session || session.ws !== ws) return

      if (msg.type === 'state') {
        if (isValidMode(msg.mode)) session.mode = msg.mode
        if (Number.isSafeInteger(msg.rev) && msg.rev >= session.rev) {
          session.rev = msg.rev
          if (resumeCredential) resumeCredential.rev = msg.rev
        }
        if (typeof msg.projectName === 'string' && msg.projectName.trim()) {
          session.projectName = msg.projectName
        }
        return
      }

      if (msg.type === 'disconnect') {
        resumeCredential = null
        clearSession(ws)
        ws.close(1000, 'Disconnected')
        return
      }

      if (msg.type === 'rpc_result' && typeof msg.id === 'string') {
        const pending = pendingRpcs.get(msg.id)
        if (!pending) return
        clearTimeout(pending.timer)
        pendingRpcs.delete(msg.id)
        if (msg.ok === true) {
          pending.resolve(msg.result)
        } else {
          const code = typeof msg.error?.code === 'string' ? msg.error.code : 'BROWSER_ERROR'
          const message =
            typeof msg.error?.message === 'string' ? msg.error.message : 'Browser request failed'
          pending.reject(makeError(code, message))
        }
      }
    })

    ws.onClose(() => {
      clearTimeout(helloTimer)
      activeSockets.delete(ws)
      clearSession(ws)
    })
  })

  return {
    start: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(requestedPort, '127.0.0.1', () => {
          server.off('error', reject)
          const addr = server.address()
          const port = typeof addr === 'object' && addr ? addr.port : requestedPort
          resolve({ host: '127.0.0.1', port, token })
        })
      }),

    stop: () =>
      new Promise((resolve) => {
        failAllPending('DISCONNECTED', 'Bridge stopped')
        session = null
        for (const ws of activeSockets) {
          ws.close(1001, 'Bridge stopping', true)
        }
        activeSockets.clear()
        if (!server.listening) {
          resolve()
          return
        }
        server.close(() => resolve())
        server.closeAllConnections()
      }),

    getStatus: () => {
      if (!session) return { connected: false }
      return {
        connected: true,
        projectId: session.projectId,
        projectName: session.projectName,
        mode: session.mode,
        rev: session.rev,
      }
    },

    callBrowser: (method, params = {}) => {
      if (!session) {
        return Promise.reject(
          makeError('NOT_CONNECTED', 'No Mind Map Studio tab is paired with the bridge.'),
        )
      }
      const currentSession = session
      const id = String(++rpcSeq)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRpcs.delete(id)
          reject(makeError('TIMEOUT', `Timed out waiting for browser response to ${method}`))
        }, requestTimeoutMs)
        timer.unref()

        pendingRpcs.set(id, { resolve, reject, timer })
        const sent = currentSession.ws.sendText(JSON.stringify({ type: 'rpc', id, method, params }))
        if (!sent) {
          clearTimeout(timer)
          pendingRpcs.delete(id)
          reject(makeError('DISCONNECTED', 'Browser session socket is closed'))
        }
      })
    },
  }
}
