import { useT, type MessageKey } from '../i18n'
import '../i18n/en/outliner'

export interface OutlinerTouchAction {
  id: string
  label: MessageKey
  aria: MessageKey
  icon: string
  onClick: () => void
  disabled?: boolean
}

/**
 * Touch buttons for the selected Brainstorm or Outline row (#95, decision
 * P-D1: buttons, no drag), standing in for Tab, Shift+Tab and Alt+↑/↓. It
 * sticks to the bottom of the list while the list scrolls.
 */
export function OutlinerTouchBar({
  title,
  actions,
}: {
  title: string
  actions: OutlinerTouchAction[]
}) {
  const t = useT()
  const name = title.trim() || t('common.untitled')
  return (
    <div
      className="touch-bar touch-bar-sticky"
      role="toolbar"
      aria-label={t('touch.rowBar')}
      data-testid="outliner-touch-bar"
      // Taps on the bar must not reach the list's own click handler.
      onClick={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={t(action.aria, { name })}
          disabled={action.disabled}
          onClick={action.onClick}
          data-testid={`row-action-${action.id}`}
        >
          <span aria-hidden="true" className="touch-bar-icon">
            {action.icon}
          </span>
          <span aria-hidden="true">{t(action.label)}</span>
        </button>
      ))}
    </div>
  )
}
