import { create } from 'zustand'
import { t } from '../i18n'

/**
 * A themed replacement for `window.prompt` (#77). `askText` opens the one
 * PromptDialog mounted at the App root and resolves with the entered text, or
 * null when the user cancels. The toolbar and the command palette share it.
 */
export interface AskTextOptions {
  title: string
  label: string
  initial?: string
  confirmLabel?: string
  maxLength?: number
  /** Return a message to show under the field, or null when the value is fine. */
  validate?: (value: string) => string | null
}

export interface PromptRequest extends AskTextOptions {
  id: number
  resolve: (value: string | null) => void
}

interface PromptState {
  request: PromptRequest | null
}

export const usePrompt = create<PromptState>()(() => ({ request: null }))

let nextId = 1

export function askText(options: AskTextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    // Only one prompt at a time: a new request cancels the one still open.
    usePrompt.getState().request?.resolve(null)
    usePrompt.setState({ request: { ...options, id: nextId++, resolve } })
  })
}

/** Close the open prompt, answering `value` (null = cancelled). */
export function settlePrompt(value: string | null): void {
  const request = usePrompt.getState().request
  if (!request) return
  usePrompt.setState({ request: null })
  request.resolve(value)
}

export const MAX_NAME_CHARS = 200

/** The 1–200 character rule shared by project and snapshot names. */
export function nameProblem(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return t('prompt.nameEmpty')
  if (trimmed.length > MAX_NAME_CHARS) {
    return t('prompt.nameTooLong', { max: MAX_NAME_CHARS, count: trimmed.length })
  }
  return null
}
