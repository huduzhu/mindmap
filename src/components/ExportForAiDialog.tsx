import { useId, useRef, useState } from 'react'
import { downloadJson, slugify } from '../io/files'
import { buildPacket } from '../io/packet'
import { DEPTHS, INTENTS, type Depth, type Intent } from '../schema/constants'
import type { Project } from '../schema/types'
import { useProjects } from '../store/projects'
import { useEditor } from '../store/editor'
import { findNode } from '../store/treeOps'
import { quote } from '../a11y/describe'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useT, type MessageKey } from '../i18n'
import '../i18n/en/export'

const INTENT_HINTS: Record<Intent, MessageKey> = {
  expand: 'ai.expand',
  convert: 'ai.convert',
  improve: 'ai.improve',
}

export function ExportForAiDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const t = useT()
  const [intent, setIntent] = useState<Intent>('expand')
  const [depth, setDepth] = useState<Depth>('titles')
  // With Brainstorm focused on a branch, "expand" can send just that branch (#146).
  const focusId = useEditor((s) => s.focus.brainstorm)
  const branch = focusId ? findNode(project.brainstorm, focusId)?.node : undefined
  const [branchOnly, setBranchOnly] = useState(true)
  const limited = Boolean(branch && branchOnly && intent === 'expand')
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })

  const download = () => {
    const projectId = useProjects.getState().currentId ?? undefined
    const packet = buildPacket(project, intent, depth, projectId, limited ? branch?.id : undefined)
    const name = limited && branch ? `${project.name}-${branch.title}` : project.name
    downloadJson(`packet-${intent}-${slugify(name)}.json`, packet)
    onClose()
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="dialog" role="dialog">
        <h2 id={titleId}>{t('ai.title')}</h2>
        <p className="muted">{t('ai.intro')}</p>

        <fieldset>
          <legend>{t('ai.intent')}</legend>
          {INTENTS.map((option) => (
            <label key={option} className="dialog-option">
              <input
                type="radio"
                name="intent"
                value={option}
                checked={intent === option}
                onChange={() => setIntent(option)}
              />
              <span>
                <strong>{t(`ai.label.${option}` as MessageKey)}</strong>
                <small>{t(INTENT_HINTS[option])}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>{t('ai.depth')}</legend>
          {DEPTHS.map((option) => (
            <label key={option} className="dialog-option">
              <input
                type="radio"
                name="depth"
                value={option}
                checked={depth === option}
                onChange={() => setDepth(option)}
              />
              <span>
                <strong>{t(`ai.label.${option}` as MessageKey)}</strong>
                <small>{option === 'titles' ? t('ai.titles') : t('ai.full')}</small>
              </span>
            </label>
          ))}
        </fieldset>

        {branch && intent === 'expand' ? (
          <label className="dialog-option">
            <input
              type="checkbox"
              checked={branchOnly}
              data-testid="ai-branch-only"
              onChange={(event) => setBranchOnly(event.target.checked)}
            />
            <span>{t('ai.branchOnly', { title: quote(branch.title) })}</span>
          </label>
        ) : null}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="primary" onClick={download}>
            {t('ai.download')}
          </button>
        </div>
      </div>
    </div>
  )
}
