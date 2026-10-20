import { create } from 'zustand'
import type { ImportResult } from '../io/import'
import { t } from '../i18n'

interface ToastState {
  message: string | null
  tone: 'info' | 'error'
  /** Counts shown messages, so a repeat is announced again (#209). */
  seq: number
  show: (message: string, tone?: 'info' | 'error') => void
  clear: () => void
}

export const useToast = create<ToastState>()((set) => ({
  message: null,
  tone: 'info',
  seq: 0,
  show: (message, tone = 'info') => set((s) => ({ message, tone, seq: s.seq + 1 })),
  clear: () => set({ message: null }),
}))

let timer: ReturnType<typeof setTimeout> | null = null
let remainingMs = 0
let startedAt = 0
let paused = false

/** A paused info toast gets at least this long once the pointer or focus leaves it. */
export const RESUME_MIN_MS = 1000

function stopTimer() {
  if (timer) clearTimeout(timer)
  timer = null
}

function startTimer(durationMs: number) {
  stopTimer()
  remainingMs = durationMs
  startedAt = Date.now()
  timer = setTimeout(() => {
    timer = null
    useToast.getState().clear()
  }, durationMs)
}

/**
 * Show a message at the bottom of the screen. Info toasts hide after
 * `durationMs` (paused while hovered or focused); error toasts stay until
 * they are dismissed, so there is time to read them (#136).
 */
export function showToast(message: string, tone: 'info' | 'error' = 'info', durationMs = 5000) {
  useToast.getState().show(message, tone)
  paused = false
  if (tone === 'error') stopTimer()
  else startTimer(durationMs)
}

/** Hold an info toast while the pointer is over it or it has focus (#136). */
export function pauseToast() {
  if (!timer) return
  remainingMs -= Date.now() - startedAt
  stopTimer()
  paused = true
}

export function resumeToast() {
  if (!paused) return
  paused = false
  if (useToast.getState().message) startTimer(Math.max(remainingMs, RESUME_MIN_MS))
}

export function dismissToast() {
  stopTimer()
  paused = false
  useToast.getState().clear()
}

export function announceImport(result: ImportResult) {
  if (!result.ok) {
    if (result.cancelled) showToast(result.error)
    else showToast(t('import.failed', { error: result.error }), 'error', 9000)
    return
  }
  const detail = result.notes.length > 0 ? ` ${result.notes.join(' ')}` : ''
  showToast(
    t(
      result.applied === 'map'
        ? 'import.appliedMap'
        : result.applied === 'project'
          ? 'import.appliedProject'
          : result.merged
            ? 'import.merged'
            : 'import.imported',
      { name: result.name, detail },
    ),
    'info',
    result.merged || result.applied ? 9000 : 5000,
  )
}
