import { useId, useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useResolvedPreset } from '../hooks/usePreset'
import { useT, type MessageKey } from '../i18n'
import '../i18n/en/export'
import { quote } from '../a11y/describe'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'
import { useUi } from '../store/ui'
import { exportBranchFile } from './exportActions'
import { showToast } from './toastStore'

type Format = 'markdown' | 'opml' | 'png' | 'svg' | 'json' | 'html' | 'ai'

const FORMATS: { format: Format; label: MessageKey }[] = [
  { format: 'markdown', label: 'branch.markdown' },
  { format: 'opml', label: 'branch.opml' },
  { format: 'png', label: 'branch.png' },
  { format: 'svg', label: 'branch.svg' },
  { format: 'json', label: 'branch.json' },
  { format: 'html', label: 'branch.html' },
  { format: 'ai', label: 'branch.ai' },
]

/** "Export this branch…" (#146): the usual exports, limited to one branch. */
export function BranchExportHost({ onClose }: { onClose: () => void }) {
  const t = useT()
  const branch = useUi((s) => s.branchExport)
  const project = useProjects((s) => s.current)
  const view = useEditor((s) => s.view)
  const preset = useResolvedPreset(project?.preset ?? 'default')
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })

  const node = branch && project ? findNode(project[branch.section], branch.id)?.node : undefined
  if (!branch || !project || !node) return null

  const run = (format: Format) => {
    setBusy(true)
    const projectId = useProjects.getState().currentId ?? undefined
    exportBranchFile(format, project, branch.section, branch.id, preset, projectId)
      .then(onClose)
      .catch((error: unknown) => {
        setBusy(false)
        showToast(
          t('toast.exportFailed', {
            error: error instanceof Error ? error.message : String(error),
          }),
          'error',
          9000,
        )
      })
  }
  // Images are taken from the map canvas; the AI packet expands Brainstorm.
  const image = (format: Format) => format === 'png' || format === 'svg'
  const offered = FORMATS.filter(({ format }) =>
    image(format) ? branch.section === 'map' : format !== 'ai' || branch.section === 'brainstorm',
  )

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog branch-export-dialog"
        role="dialog"
        data-testid="branch-export-dialog"
      >
        <h2 id={titleId}>{t('branch.title', { title: quote(node.title) })}</h2>
        <p className="muted">{t('branch.intro')}</p>
        <div className="branch-export-formats">
          {offered.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              disabled={busy || (image(format) && view !== 'map')}
              data-testid={`branch-export-${format}`}
              onClick={() => run(format)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        {branch.section === 'map' && view !== 'map' ? (
          <p className="muted">{t('branch.imageOnMap')}</p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
