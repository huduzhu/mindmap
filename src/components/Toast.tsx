import { useT } from '../i18n'
import { dismissToast, pauseToast, resumeToast, useToast } from './toastStore'

export function ToastHost() {
  const t = useT()
  const message = useToast((s) => s.message)
  const tone = useToast((s) => s.tone)
  const seq = useToast((s) => s.seq)
  // Errors interrupt (role="alert") and stay until closed; info toasts are
  // polite and wait while hovered or focused (#136). Both live regions stay
  // mounted and only their text changes, so screen readers announce it; a
  // repeat of the same message differs by a trailing no-break space (#209).
  const text = message ? message + (seq % 2 ? ' ' : '') : ''
  return (
    <div
      className={message ? `toast toast-${tone}` : undefined}
      onMouseEnter={pauseToast}
      onMouseLeave={resumeToast}
      onFocus={pauseToast}
      onBlur={resumeToast}
      onClick={dismissToast}
    >
      <span className="toast-message">
        <span role="status">{tone === 'error' ? '' : text}</span>
        <span role="alert">{tone === 'error' ? text : ''}</span>
      </span>
      {message ? (
        <button
          type="button"
          className="toast-close"
          aria-label={t('toast.close')}
          title={t('toast.close')}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
