import { useT } from '../i18n'
import { dismissToast, pauseToast, resumeToast, useToast } from './toastStore'

export function ToastHost() {
  const t = useT()
  const message = useToast((s) => s.message)
  const tone = useToast((s) => s.tone)
  if (!message) return null
  // Errors interrupt (role="alert") and stay until closed; info toasts are
  // polite and wait while hovered or focused (#136).
  return (
    <div
      className={`toast toast-${tone}`}
      onMouseEnter={pauseToast}
      onMouseLeave={resumeToast}
      onFocus={pauseToast}
      onBlur={resumeToast}
      onClick={dismissToast}
    >
      <span className="toast-message" role={tone === 'error' ? 'alert' : 'status'}>
        {message}
      </span>
      <button
        type="button"
        className="toast-close"
        aria-label={t('toast.close')}
        title={t('toast.close')}
      >
        ×
      </button>
    </div>
  )
}
