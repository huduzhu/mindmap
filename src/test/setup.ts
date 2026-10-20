import { afterEach, beforeAll, beforeEach, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { resetAnnouncer } from '../a11y/announcer'
import { useChoice } from '../components/choiceStore'
import { clearMissingMessages, missingMessages, useLocale } from '../i18n'
import { usePrompt } from '../components/promptStore'
import { useUi } from '../store/ui'

// The details panel's body is a lazy chunk the app preloads once idle; load it
// here too, so tests see the panel in the same render as the selection.
beforeAll(async () => {
  const { loadDetailsPanel } = await import('../components/lazyParts')
  await loadDetailsPanel()
})

// Dialog/palette flags are global, so a test that opens one and never closes it
// would otherwise leak an open dialog into the next test's render. Resetting
// here restores the isolation component-local state used to give for free.
beforeEach(() => {
  useUi.getState().closeAll()
  usePrompt.setState({ request: null })
  resetAnnouncer()
  useChoice.setState({ request: null })
  useLocale.setState({ locale: 'en' })
  // The last-open project and trash settings live in localStorage (#75, #83);
  // never let one test reopen another test's project.
  try {
    localStorage.clear()
  } catch {
    // Node-environment test files have no localStorage.
  }
})

// H-0: a key whose lazily loaded table was not there yet shows as the raw key.
// Fail the test that rendered or announced it.
afterEach(() => {
  const missing = missingMessages()
  clearMissingMessages()
  expect(missing, 'message keys used before their table was loaded').toEqual([])
})

type ActFn = (callback: () => unknown) => unknown

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const act: ActFn =
    (actual as { act?: ActFn }).act ??
    (actual as { default?: { act?: ActFn } }).default?.act ??
    ((callback) => callback())
  const reactNamespace = actual as unknown as { default?: object | null }
  const base: object =
    reactNamespace.default && typeof reactNamespace.default === 'object'
      ? reactNamespace.default
      : (actual as object)
  return {
    ...actual,
    act,
    default: { ...base, act },
  }
})

// `react-dom/test-utils` is aliased to src/test/reactDomTestUtilsShim.ts in
// vite.config.ts (test mode). A vi.mock here used to shadow that alias.

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

class BroadcastChannelStub {
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  constructor(name: string) {
    this.name = name
  }
  postMessage() {}
  close() {}
  unref() {}
  ref() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true
  }
}

// In Node 24 with pool: 'threads', real BroadcastChannels broadcast across all
// worker threads in the process, poisoning IndexedDB tests running in parallel.
globalThis.BroadcastChannel = BroadcastChannelStub as unknown as typeof BroadcastChannel
