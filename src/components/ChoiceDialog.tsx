import { useId, useRef } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { settleChoice, useChoice, type ChoiceRequest } from './choiceStore'
import { useT } from '../i18n'

/** Renders the question opened by `askChoice`. Mount once at the App root. */
export function ChoiceHost() {
  const request = useChoice((state) => state.request)
  if (!request) return null
  return <ChoiceDialog key={request.id} request={request} />
}

function ChoiceDialog({ request }: { request: ChoiceRequest }) {
  const t = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const defaultRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()
  useDialogA11y(dialogRef, {
    isOpen: true,
    onClose: () => settleChoice(null),
    labelledBy: titleId,
    initialFocusRef: defaultRef,
  })

  return (
    <div
      className="dialog-backdrop dialog-backdrop-confirm"
      onClick={(event) => {
        if (event.target === event.currentTarget) settleChoice(null)
      }}
    >
      <div
        ref={dialogRef}
        className="dialog choice-dialog"
        role="dialog"
        aria-describedby={messageId}
        data-testid="choice-dialog"
      >
        <h2 id={titleId}>{request.title}</h2>
        <p id={messageId} className="muted">
          {request.message}
        </p>
        {request.details && request.details.length > 0 && (
          <ul className="choice-details">
            {request.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <div className="choice-options">
          {request.choices.map((choice, index) => (
            <button
              key={choice.value}
              ref={index === 0 ? defaultRef : undefined}
              type="button"
              className={`choice-option${choice.tone ? ` ${choice.tone}` : ''}`}
              data-testid={`choice-${choice.value}`}
              onClick={() => settleChoice(choice.value)}
            >
              <span className="choice-label">{choice.label}</span>
              {choice.detail && <span className="choice-detail">{choice.detail}</span>}
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={() => settleChoice(null)}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
