export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'error'

export interface Autosave<T> {
  schedule: (value: T) => void
  flush: () => Promise<void>
  cancel: () => void
  hasPending: () => boolean
  status: () => AutosaveStatus
  lastError: () => unknown
}

/**
 * Debounced saving: a save runs `delayMs` after the last schedule(). Edits that
 * keep coming (typing without a pause) still save at least every `maxWaitMs`,
 * so a crash or a closed tab cannot lose minutes of work.
 */
export function createAutosave<T>(
  save: (value: T) => Promise<void>,
  delayMs = 800,
  onStatus?: (status: AutosaveStatus, error?: unknown) => void,
  maxWaitMs = 5000,
): Autosave<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
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

  const clearTimers = () => {
    if (timer) clearTimeout(timer)
    if (maxTimer) clearTimeout(maxTimer)
    timer = null
    maxTimer = null
  }

  const run = () => {
    if (!hasPending || running) return Promise.resolve()
    // This write takes the latest value, so neither wait is needed any more.
    clearTimers()
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
      // The longest a pending value waits. While a write runs, run() leaves
      // it to that write's follow-up, so two writes never overlap.
      maxTimer ??= setTimeout(() => {
        maxTimer = null
        void run()
      }, maxWaitMs)
    },
    async flush() {
      clearTimers()
      if (running) await running
      if (hasPending) await run()
      if (running) await running
    },
    cancel() {
      clearTimers()
      pending = undefined
      hasPending = false
      setStatus('idle')
    },
    hasPending: () => hasPending,
    status: () => currentStatus,
    lastError: () => currentError,
  }
}
