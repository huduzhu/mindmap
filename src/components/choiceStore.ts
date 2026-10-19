import { create } from 'zustand'

/**
 * A themed multiple-choice question (#84, #87): `askChoice` opens the one
 * ChoiceDialog mounted at the App root and resolves with the chosen value, or
 * null when the user cancels. The first choice is the default (focused).
 */
export interface Choice<T extends string> {
  value: T
  label: string
  /** One line under the button saying what it does. */
  detail?: string
  tone?: 'primary' | 'danger'
}

export interface ChoiceOptions<T extends string> {
  title: string
  message: string
  /** Optional short lines shown as a list under the message. */
  details?: string[]
  choices: Choice<T>[]
}

export interface ChoiceRequest extends ChoiceOptions<string> {
  id: number
  resolve: (value: string | null) => void
}

export const useChoice = create<{ request: ChoiceRequest | null }>()(() => ({ request: null }))

let nextId = 1

export function askChoice<T extends string>(options: ChoiceOptions<T>): Promise<T | null> {
  return new Promise((resolve) => {
    useChoice.getState().request?.resolve(null)
    useChoice.setState({
      request: {
        ...(options as ChoiceOptions<string>),
        id: nextId++,
        resolve: resolve as (value: string | null) => void,
      },
    })
  })
}

export function settleChoice(value: string | null): void {
  const request = useChoice.getState().request
  if (!request) return
  useChoice.setState({ request: null })
  request.resolve(value)
}
