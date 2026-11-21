import { useCoeditBadge } from '../coedit/badgeStore'
import { tn, useT } from '../i18n'
import { useUi } from '../store/ui'

/** Toolbar status pill while an AI agent is paired to the open project (#37). */
export function CoeditBadge() {
  const t = useT()
  const connected = useCoeditBadge((s) => s.connected)
  const pendingCount = useCoeditBadge((s) => s.pendingCount)
  const agentName = useCoeditBadge((s) => s.agentName)
  if (!connected) return null

  const agent = agentName ?? 'AI'
  const label =
    pendingCount > 0
      ? tn('coedit.badgePending', pendingCount, { agent })
      : t('coedit.badge', { agent })

  return (
    <button
      type="button"
      className={`status-badge coedit-badge${pendingCount > 0 ? ' coedit-badge-pending' : ''}`}
      onClick={() => useUi.getState().setCoeditOpen(true)}
      aria-label={t('coedit.badgeLabel', { status: label })}
      data-testid="coedit-badge"
    >
      <span aria-hidden="true">✦</span> {label}
    </button>
  )
}
