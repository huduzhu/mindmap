// @vitest-environment node
import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canRememberPairing,
  forgetRememberedPairing,
  rememberedPairing,
  storeRememberedPairing,
} from './rememberedPairing'

function installLocalEnv(hostname: string, hasSubtle = true) {
  const storage = new Map<string, string>()
  vi.stubGlobal('location', { hostname })
  vi.stubGlobal('crypto', hasSubtle ? webcrypto : {})
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  })
  return storage
}

const VALID_SECRET = 'a'.repeat(64)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('rememberedPairing', () => {
  it('enables remembering only on loopback hosts with WebCrypto', () => {
    installLocalEnv('127.0.0.1', true)
    expect(canRememberPairing()).toBe(true)

    installLocalEnv('localhost', true)
    expect(canRememberPairing()).toBe(true)

    installLocalEnv('huduzhu.github.io', true)
    expect(canRememberPairing()).toBe(false)

    installLocalEnv('127.0.0.1', false)
    expect(canRememberPairing()).toBe(false)
  })

  it('round-trips valid pairings and rejects corrupt or mismatched records', () => {
    const storage = installLocalEnv('localhost', true)
    const pairing = { projectId: 'proj-a', port: 4317, secret: VALID_SECRET }
    expect(storeRememberedPairing(pairing)).toBe(true)
    expect(rememberedPairing('proj-a')).toEqual(pairing)
    expect(rememberedPairing('proj-b')).toBeNull()

    storage.set('mindmap.coedit.remembered.v1', '{not-json')
    expect(rememberedPairing('proj-a')).toBeNull()

    storage.set(
      'mindmap.coedit.remembered.v1',
      JSON.stringify({ projectId: 'proj-a', port: 70000, secret: VALID_SECRET }),
    )
    expect(rememberedPairing('proj-a')).toBeNull()

    storage.set(
      'mindmap.coedit.remembered.v1',
      JSON.stringify({ projectId: 'proj-a', port: 4317, secret: 'short' }),
    )
    expect(rememberedPairing('proj-a')).toBeNull()
  })

  it('forgets matching project or invalidated same-port entries while keeping other ports', () => {
    const storage = installLocalEnv('127.0.0.1', true)
    const pairing = { projectId: 'proj-a', port: 4317, secret: VALID_SECRET }
    storeRememberedPairing(pairing)

    // Another port does not clobber proj-a's saved pairing on port 4317.
    forgetRememberedPairing('proj-b', 4318)
    expect(rememberedPairing('proj-a')).toEqual(pairing)

    // Manual pairing of proj-b on the same port invalidates proj-a's stale entry.
    forgetRememberedPairing('proj-b', 4317)
    expect(storage.has('mindmap.coedit.remembered.v1')).toBe(false)
    expect(rememberedPairing('proj-a')).toBeNull()

    storeRememberedPairing(pairing)
    forgetRememberedPairing('proj-a')
    expect(rememberedPairing('proj-a')).toBeNull()
  })
})
