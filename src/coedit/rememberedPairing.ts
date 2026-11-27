const storageKey = 'mindmap.coedit.remembered.v1'

interface RememberedPairing {
  projectId: string
  port: number
  secret: string
}

export function canRememberPairing(): boolean {
  // Do not persist a co-edit credential on shared hosting origins.
  return (
    Boolean(globalThis.crypto?.subtle) && ['127.0.0.1', 'localhost'].includes(location.hostname)
  )
}

function readRememberedPairing(): RememberedPairing | null {
  if (!canRememberPairing()) return null
  try {
    const value = JSON.parse(
      localStorage.getItem(storageKey) ?? 'null',
    ) as Partial<RememberedPairing> | null
    if (
      typeof value?.projectId === 'string' &&
      value.projectId.length > 0 &&
      typeof value.port === 'number' &&
      Number.isInteger(value.port) &&
      value.port > 0 &&
      value.port <= 65535 &&
      typeof value.secret === 'string' &&
      /^[0-9a-f]{64}$/.test(value.secret)
    ) {
      return { projectId: value.projectId, port: value.port, secret: value.secret }
    }
  } catch {
    // Storage can be unavailable or damaged; pairing with a code still works.
  }
  return null
}

export function rememberedPairing(projectId: string): RememberedPairing | null {
  const value = readRememberedPairing()
  return value?.projectId === projectId ? value : null
}

export function storeRememberedPairing(pairing: RememberedPairing): boolean {
  if (!canRememberPairing()) return false
  try {
    localStorage.setItem(storageKey, JSON.stringify(pairing))
    return true
  } catch {
    return false
  }
}

export function forgetRememberedPairing(projectId: string, port?: number): void {
  const value = readRememberedPairing()
  if (!value) return
  if (value.projectId !== projectId && (port === undefined || value.port !== port)) return
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // The bridge revokes connected credentials independently of browser storage.
  }
}
