import { createHash } from 'node:crypto'

export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const OPCODE_CONTINUATION = 0x0
const OPCODE_TEXT = 0x1
const OPCODE_BINARY = 0x2
const OPCODE_CLOSE = 0x8
const OPCODE_PING = 0x9
const OPCODE_PONG = 0xa

function encodeFrame(opcode, payload) {
  const len = payload.length
  let headerLen = 2
  if (len >= 126 && len <= 0xffff) headerLen = 4
  else if (len > 0xffff) headerLen = 10

  const frame = Buffer.allocUnsafe(headerLen + len)
  frame[0] = 0x80 | opcode
  if (len < 126) {
    frame[1] = len
  } else if (len <= 0xffff) {
    frame[1] = 126
    frame.writeUInt16BE(len, 2)
  } else {
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(len), 2)
  }
  payload.copy(frame, headerLen)
  return frame
}

/**
 * Complete an RFC 6455 WebSocket server handshake and return a lightweight
 * text-frame connection wrapper. Returns `null` if the upgrade request headers
 * are invalid (caller is responsible for closing the socket).
 */
export function acceptWebSocket(req, socket, head) {
  const upgrade = String(req.headers.upgrade ?? '').toLowerCase()
  const version = String(req.headers['sec-websocket-version'] ?? '')
  const key = req.headers['sec-websocket-key']
  if (upgrade !== 'websocket' || version !== '13' || typeof key !== 'string' || !key.trim()) {
    return null
  }

  const accept = createHash('sha1').update(`${key.trim()}${WS_GUID}`).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )

  const messageHandlers = new Set()
  const closeHandlers = new Set()
  let buffer = head && head.length > 0 ? Buffer.from(head) : Buffer.alloc(0)
  let fragChunks = null
  let fragBytes = 0
  let closed = false

  function emitClose(code = 1006, reason = '') {
    if (closed) return
    closed = true
    for (const handler of closeHandlers) handler(code, reason)
  }

  function close(code = 1000, reason = '', destroy = false) {
    if (closed) return
    const reasonBuf = Buffer.from(String(reason), 'utf8').subarray(0, 123)
    const payload = Buffer.allocUnsafe(2 + reasonBuf.length)
    payload.writeUInt16BE(code, 0)
    reasonBuf.copy(payload, 2)
    if (!socket.destroyed && socket.writable) {
      socket.write(encodeFrame(OPCODE_CLOSE, payload))
      socket.end()
      if (destroy) {
        setImmediate(() => {
          if (!socket.destroyed) socket.destroy()
        })
      }
    }
    emitClose(code, reasonBuf.toString('utf8'))
  }

  function sendText(text) {
    if (closed || socket.destroyed || !socket.writable) return false
    socket.write(encodeFrame(OPCODE_TEXT, Buffer.from(String(text), 'utf8')))
    return true
  }

  function emitText(buf) {
    const text = buf.toString('utf8')
    for (const handler of messageHandlers) handler(text)
  }

  function drain() {
    while (!closed && buffer.length >= 2) {
      const first = buffer[0]
      const second = buffer[1]
      const fin = (first & 0x80) !== 0
      const rsv = first & 0x70
      const opcode = first & 0x0f
      if (rsv !== 0) {
        close(1002, 'Unsupported RSV bits')
        return
      }

      const masked = (second & 0x80) !== 0
      if (!masked) {
        close(1002, 'Unmasked client frame')
        return
      }

      let payloadLen = second & 0x7f
      let offset = 2
      if (payloadLen === 126) {
        if (buffer.length < 4) return
        payloadLen = buffer.readUInt16BE(2)
        offset = 4
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return
        const bigLen = buffer.readBigUInt64BE(2)
        if (bigLen > BigInt(MAX_MESSAGE_BYTES)) {
          close(1009, 'Message too large')
          return
        }
        payloadLen = Number(bigLen)
        offset = 10
      }

      if (payloadLen > MAX_MESSAGE_BYTES) {
        close(1009, 'Message too large')
        return
      }

      const maskEnd = offset + 4
      const frameEnd = maskEnd + payloadLen
      if (buffer.length < frameEnd) return

      const payload = Buffer.allocUnsafe(payloadLen)
      for (let i = 0; i < payloadLen; i++) {
        payload[i] = buffer[maskEnd + i] ^ buffer[offset + (i & 3)]
      }
      buffer = buffer.subarray(frameEnd)

      if (opcode >= 0x8) {
        if (!fin || payloadLen > 125) {
          close(1002, 'Invalid control frame')
          return
        }
        if (opcode === OPCODE_CLOSE) {
          const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005
          const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : ''
          if (!socket.destroyed && socket.writable) {
            const ack = Buffer.allocUnsafe(2)
            ack.writeUInt16BE(code === 1005 ? 1000 : code, 0)
            socket.write(encodeFrame(OPCODE_CLOSE, ack))
            socket.end()
          }
          emitClose(code, reason)
          return
        }
        if (opcode === OPCODE_PING) {
          if (!socket.destroyed && socket.writable) {
            socket.write(encodeFrame(OPCODE_PONG, payload))
          }
          continue
        }
        if (opcode === OPCODE_PONG) continue
        close(1002, 'Unknown control opcode')
        return
      }

      if (opcode === OPCODE_BINARY) {
        close(1003, 'Binary frames not supported')
        return
      }

      if (opcode === OPCODE_TEXT) {
        if (fragChunks !== null) {
          close(1002, 'Unexpected text frame during fragmentation')
          return
        }
        if (fin) {
          emitText(payload)
        } else {
          fragChunks = [payload]
          fragBytes = payload.length
        }
        continue
      }

      if (opcode === OPCODE_CONTINUATION) {
        if (fragChunks === null) {
          close(1002, 'Unexpected continuation frame')
          return
        }
        fragBytes += payload.length
        if (fragBytes > MAX_MESSAGE_BYTES) {
          close(1009, 'Message too large')
          return
        }
        fragChunks.push(payload)
        if (fin) {
          const combined = Buffer.concat(fragChunks, fragBytes)
          fragChunks = null
          fragBytes = 0
          emitText(combined)
        }
        continue
      }

      close(1002, 'Unsupported opcode')
      return
    }
  }

  socket.on('data', (chunk) => {
    if (closed) return
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
    drain()
  })
  socket.on('close', () => emitClose())
  socket.on('error', () => emitClose())

  if (buffer.length > 0) {
    queueMicrotask(drain)
  }

  return {
    sendText,
    close,
    onMessage: (fn) => {
      messageHandlers.add(fn)
      return () => messageHandlers.delete(fn)
    },
    onClose: (fn) => {
      closeHandlers.add(fn)
      return () => closeHandlers.delete(fn)
    },
  }
}
