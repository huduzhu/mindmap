import { useId, useRef } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useT } from '../i18n'

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, {
    isOpen: true,
    onClose,
    labelledBy: titleId,
    initialFocusRef: cancelRef,
  })

  return (
    <div
      className="dialog-backdrop dialog-backdrop-confirm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="dialog" role="dialog" data-testid="confirm-dialog">
        <h2 id={titleId}>{title}</h2>
        <p className="muted">{message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" onClick={onClose}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            className="danger"
            data-testid="confirm-dialog-accept"
            onClick={onConfirm}
          >
            {confirmLabel ?? t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
