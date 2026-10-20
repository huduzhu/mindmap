export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'error'

export interface Autosave<T> {
  schedule: (value: T) => void
  flush: () => Promise<void>
  cancel: () => void
  hasPending: () => boolean
  status: () => AutosaveStatus
  lastError: () => unknown
}

export function createAutosave<T>(
  save: (value: T) => Promise<void>,
  delayMs = 800,
  onStatus?: (status: AutosaveStatus, error?: unknown) => void,
): Autosave<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: T | undefined
  let hasPending = false
  let running: Promise<void> | null = null
  let currentStatus: AutosaveStatus = 'idle'
  let currentError: unknown

  const setStatus = (status: AutosaveStatus, error?: unknown) => {
    currentStatus = status
    currentError = status === 'error' ? error : undefined
    onStatus?.(status, currentError)
  }

  const run = () => {
    if (!hasPending || running) return Promise.resolve()
    const value = pending as T
    pending = undefined
    hasPending = false
    setStatus('saving')
    running = save(value)
      .then(() => {
        if (!hasPending) setStatus('idle')
      })
      .catch((error: unknown) => {
        if (!hasPending) {
          pending = value
          hasPending = true
        }
        setStatus('error', error)
      })
      .finally(() => {
        running = null
        if (hasPending && currentStatus !== 'error') void run()
      })
    return running
  }

  return {
    schedule(value: T) {
      pending = value
      hasPending = true
      setStatus('pending')
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void run()
      }, delayMs)
    },
    async flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (running) await running
      if (hasPending) await run()
      if (running) await running
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = undefined
      hasPending = false
      setStatus('idle')
    },
    hasPending: () => hasPending,
    status: () => currentStatus,
    lastError: () => currentError,
  }
}
