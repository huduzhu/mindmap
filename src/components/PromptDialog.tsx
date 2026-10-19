import { useId, useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { settlePrompt, usePrompt, type PromptRequest } from './promptStore'
import { useT } from '../i18n'

/** Renders the request opened by `askText` (#77). Mount once at the App root. */
export function PromptHost() {
  const request = usePrompt((state) => state.request)
  if (!request) return null
  return <PromptDialog key={request.id} request={request} />
}

function PromptDialog({ request }: { request: PromptRequest }) {
  const t = useT()
  const { title, label, initial = '', confirmLabel = t('common.ok'), maxLength, validate } = request
  const [value, setValue] = useState(initial)
  const [attempted, setAttempted] = useState(false)
  const dialogRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const inputId = useId()
  const errorId = useId()
  useDialogA11y(dialogRef, {
    isOpen: true,
    onClose: () => settlePrompt(null),
    labelledBy: titleId,
    initialFocusRef: inputRef,
  })

  const problem = validate?.(value) ?? null
  // Say what is wrong as soon as the user has typed or tried to submit, not
  // while the untouched default is showing.
  const showProblem = problem !== null && (attempted || value !== initial)

  return (
    <div
      className="dialog-backdrop dialog-backdrop-confirm"
      onClick={(event) => {
        if (event.target === event.currentTarget) settlePrompt(null)
      }}
    >
      <form
        ref={dialogRef}
        className="dialog prompt-dialog"
        role="dialog"
        data-testid="prompt-dialog"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setAttempted(true)
          if (problem === null) settlePrompt(value)
          else inputRef.current?.focus()
        }}
      >
        <h2 id={titleId}>{title}</h2>
        <label className="prompt-dialog-field" htmlFor={inputId}>
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="prompt-dialog-input"
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={showProblem}
          aria-describedby={showProblem ? errorId : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setValue(event.target.value)}
        />
        <p id={errorId} className="prompt-dialog-error" role="alert">
          {showProblem ? problem : ''}
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={() => settlePrompt(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="primary" data-testid="prompt-dialog-accept">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
