import { useEffect, useId, useRef, useState } from 'react'
import {
  cancelBridgePairing,
  CoeditConnectionError,
  connectToBridge,
  disconnectBridge,
  getCoeditConnectionInfo,
  setBridgeMode,
} from '../coedit/client'
import { useCoedit } from '../coedit/session'
import type {
  CoeditConflict,
  CoeditMode,
  CoeditOp,
  CoeditResolution,
  EvaluateBatchResult,
  SelectiveUndoResult,
} from '../coedit/types'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { tn, useT } from '../i18n'
import '../i18n/en/coedit'
import type { TreeNode } from '../schema/types'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'

function nodeLabel(map: TreeNode | undefined, id: string): string {
  if (!map) return id
  const found = findNode(map, id)
  return found ? `“${found.node.title}”` : id
}

function describeOp(op: CoeditOp, map: TreeNode | undefined, t: ReturnType<typeof useT>): string {
  switch (op.type) {
    case 'add_node':
      return t('coedit.op.addNode', { title: op.title, parent: nodeLabel(map, op.parentId) })
    case 'rename_node':
      return t('coedit.op.renameNode', { node: nodeLabel(map, op.id), title: op.title })
    case 'move_node':
      return t('coedit.op.moveNode', {
        node: nodeLabel(map, op.id),
        parent: nodeLabel(map, op.newParentId),
      })
    case 'update_notes':
      return t('coedit.op.updateNotes', { node: nodeLabel(map, op.id) })
  }
}

export function CoeditDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const current = useProjects((s) => s.current)
  const projectId = useCoedit((s) => s.projectId)
  const agentName = useCoedit((s) => s.agentName)
  const mode = useCoedit((s) => s.mode)
  const pendingBatches = useCoedit((s) => s.pendingBatches)
  const activity = useCoedit((s) => s.activity)

  const [portText, setPortText] = useState(() => String(getCoeditConnectionInfo()?.port ?? 4317))
  const [token, setToken] = useState('')
  const [connectMode, setConnectMode] = useState<CoeditMode>('approve-writes')
  const [busy, setBusy] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, Record<number, CoeditResolution>>>(
    {},
  )
  const [evalResults, setEvalResults] = useState<Record<string, EvaluateBatchResult>>({})
  const [undoConflicts, setUndoConflicts] = useState<Record<string, SelectiveUndoResult>>({})

  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Navigation can unmount the dialog without invoking its close handler.
  // Cancel only a pending handshake; closing an already paired dialog keeps the session.
  useEffect(() => cancelBridgePairing, [])
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })

  const handleConnect = () => {
    const port = Number(portText.trim())
    setBusy(true)
    setConnectError(null)
    void connectToBridge({ port, token, mode: connectMode })
      .then(() => {
        setToken('')
      })
      .catch((err: unknown) => {
        if (err instanceof CoeditConnectionError) {
          setConnectError(t(`coedit.error.${err.code}` as const))
        } else {
          setConnectError(t('coedit.error.connection_failed'))
        }
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const pickResolution = (batchId: string, opIndex: number, resolution: CoeditResolution) => {
    setResolutions((prev) => ({
      ...prev,
      [batchId]: {
        ...(prev[batchId] ?? {}),
        [opIndex]: resolution,
      },
    }))
  }

  const handleApprove = (batchId: string) => {
    const batchResolutions = resolutions[batchId]
    const result = useCoedit.getState().approveBatch(batchId, batchResolutions)
    if (!result) return
    if (result.ok) {
      setEvalResults((prev) => {
        const next = { ...prev }
        delete next[batchId]
        return next
      })
      setResolutions((prev) => {
        const next = { ...prev }
        delete next[batchId]
        return next
      })
    } else {
      setEvalResults((prev) => ({ ...prev, [batchId]: result }))
    }
  }

  const handleReject = (batchId: string) => {
    useCoedit.getState().rejectBatch(batchId)
    setEvalResults((prev) => {
      const next = { ...prev }
      delete next[batchId]
      return next
    })
    setResolutions((prev) => {
      const next = { ...prev }
      delete next[batchId]
      return next
    })
  }

  const handleUndoEntry = (entryId: string, force = false) => {
    const res = useCoedit.getState().undoActivityEntry(entryId, force)
    if (!res) return
    if (res.ok) {
      setUndoConflicts((prev) => {
        const next = { ...prev }
        delete next[entryId]
        return next
      })
    } else {
      setUndoConflicts((prev) => ({ ...prev, [entryId]: res }))
    }
  }

  const connInfo = getCoeditConnectionInfo()
  const isConnected = Boolean(projectId)
  const snippetPort = /^\d+$/.test(portText.trim()) ? portText.trim() : '4317'
  const hermesConfigSnippet = [
    'mcp_servers:',
    '  mindmap:',
    '    command: "node"',
    '    args:',
    '      - "/path/to/mindmap/bridge/index.mjs"',
    '      - "--port"',
    `      - "${snippetPort}"`,
  ].join('\n')

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog coedit-dialog"
        role="dialog"
        aria-labelledby={titleId}
        data-testid="coedit-dialog"
      >
        <h2 id={titleId}>{t('coedit.title')}</h2>

        {!isConnected ? (
          <>
            <p>{t('coedit.intro')}</p>
            <label className="prompt-dialog-field">
              <span>{t('coedit.port')}</span>
              <input
                type="number"
                className="prompt-dialog-input"
                min={1}
                max={65535}
                value={portText}
                onChange={(e) => setPortText(e.target.value)}
                data-testid="coedit-port"
              />
            </label>
            <label className="prompt-dialog-field">
              <span>{t('coedit.token')}</span>
              <input
                type="password"
                className="prompt-dialog-input"
                value={token}
                placeholder={t('coedit.tokenPlaceholder')}
                onChange={(e) => setToken(e.target.value)}
                data-testid="coedit-token"
              />
            </label>
            <fieldset>
              <legend>{t('coedit.modeLabel')}</legend>
              <label className="dialog-option">
                <input
                  type="radio"
                  name="coedit-mode"
                  value="approve-writes"
                  checked={connectMode === 'approve-writes'}
                  onChange={() => setConnectMode('approve-writes')}
                  data-testid="coedit-mode-approve"
                />
                <span>{t('coedit.mode.approveWrites')}</span>
              </label>
              <label className="dialog-option">
                <input
                  type="radio"
                  name="coedit-mode"
                  value="read-only"
                  checked={connectMode === 'read-only'}
                  onChange={() => setConnectMode('read-only')}
                  data-testid="coedit-mode-readonly"
                />
                <span>{t('coedit.mode.readOnly')}</span>
              </label>
            </fieldset>
            {connectError ? (
              <p className="prompt-dialog-error" role="alert" data-testid="coedit-error">
                {connectError}
              </p>
            ) : null}
            <p className="muted">{t('coedit.hermesTip')}</p>
            <details className="coedit-section">
              <summary>{t('coedit.hermesConfigSummary')}</summary>
              <pre className="coedit-notes-preview">{hermesConfigSnippet}</pre>
            </details>
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                {t('coedit.close')}
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || !current}
                onClick={handleConnect}
                data-testid="coedit-connect"
              >
                {busy ? t('coedit.connecting') : t('coedit.connect')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p data-testid="coedit-connected-summary">
              {t('coedit.connectedTo', {
                agent: agentName ?? 'Hermes',
                port: connInfo?.port ?? portText,
                project: current?.name ?? '',
              })}
            </p>
            <fieldset>
              <legend>{t('coedit.modeLabel')}</legend>
              <label className="dialog-option">
                <input
                  type="radio"
                  name="coedit-active-mode"
                  value="approve-writes"
                  checked={mode === 'approve-writes'}
                  onChange={() => setBridgeMode('approve-writes')}
                  data-testid="coedit-active-approve"
                />
                <span>{t('coedit.mode.approveWrites')}</span>
              </label>
              <label className="dialog-option">
                <input
                  type="radio"
                  name="coedit-active-mode"
                  value="read-only"
                  checked={mode === 'read-only'}
                  onChange={() => setBridgeMode('read-only')}
                  data-testid="coedit-active-readonly"
                />
                <span>{t('coedit.mode.readOnly')}</span>
              </label>
            </fieldset>

            <section className="coedit-section">
              <h3>{t('coedit.pendingTitle')}</h3>
              {pendingBatches.length === 0 ? (
                <p className="muted" data-testid="coedit-no-pending">
                  {t('coedit.noPending')}
                </p>
              ) : (
                pendingBatches.map((batch) => {
                  const evalResult = evalResults[batch.id]
                  const batchResolutions = resolutions[batch.id] ?? {}
                  return (
                    <div key={batch.id} className="coedit-card" data-testid="coedit-pending-batch">
                      <div className="coedit-card-header">
                        <strong>{batch.summary}</strong>
                        <span className="muted">{batch.agentName}</span>
                      </div>
                      <ul className="coedit-ops">
                        {batch.operations.map((op, idx) => (
                          <li key={idx}>
                            {describeOp(op, current?.map, t)}
                            {(op.type === 'add_node' || op.type === 'update_notes') &&
                            op.notes !== undefined ? (
                              <div>
                                <span>{t('coedit.proposedNotes')}</span>
                                {op.notes === '' ? (
                                  <span> {t('coedit.emptyNotes')}</span>
                                ) : (
                                  <pre className="coedit-notes-preview">{op.notes}</pre>
                                )}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {evalResult && evalResult.errors.length > 0 ? (
                        <p className="prompt-dialog-error" role="alert">
                          {t('coedit.batchErrors', {
                            errors: evalResult.errors.map((e) => e.reason).join(', '),
                          })}
                        </p>
                      ) : null}
                      {evalResult && evalResult.conflicts.length > 0 ? (
                        <div
                          className="coedit-conflicts"
                          role="alert"
                          data-testid="coedit-conflicts"
                        >
                          {evalResult.conflicts.map((conflict: CoeditConflict) => {
                            const picked = batchResolutions[conflict.opIndex]
                            const isKeep = picked === 'keep_human'
                            const reviewedRev = conflict.changedAtRev
                            const isAgent =
                              typeof picked === 'object' &&
                              picked.choice === 'take_agent' &&
                              picked.reviewedRev === reviewedRev
                            return (
                              <div key={conflict.opIndex} className="coedit-conflict">
                                <div>
                                  <strong>
                                    {t('coedit.conflictTitle', {
                                      node: nodeLabel(current?.map, conflict.nodeId),
                                      field: conflict.field,
                                    })}
                                  </strong>{' '}
                                  {conflict.reason === 'concurrent_edit' ? (
                                    <span>
                                      {t('coedit.conflictValues', {
                                        current: conflict.currentValue ?? '',
                                        proposed: conflict.proposedValue ?? '',
                                      })}
                                    </span>
                                  ) : (
                                    <span>{t('coedit.conflictDeleted')}</span>
                                  )}
                                </div>
                                <div className="coedit-conflict-actions">
                                  <button
                                    type="button"
                                    className={isKeep ? 'primary' : undefined}
                                    onClick={() =>
                                      pickResolution(batch.id, conflict.opIndex, 'keep_human')
                                    }
                                    data-testid={`coedit-keep-mine-${conflict.opIndex}`}
                                  >
                                    {t('coedit.keepMine')}
                                  </button>
                                  {conflict.reason === 'concurrent_edit' &&
                                  reviewedRev !== undefined ? (
                                    <button
                                      type="button"
                                      className={isAgent ? 'primary' : undefined}
                                      onClick={() =>
                                        pickResolution(batch.id, conflict.opIndex, {
                                          choice: 'take_agent',
                                          reviewedRev,
                                        })
                                      }
                                      data-testid={`coedit-take-agent-${conflict.opIndex}`}
                                    >
                                      {t('coedit.takeAgent')}
                                    </button>
                                  ) : null}
                                  {isKeep ? (
                                    <span className="muted">{t('coedit.resolvedKeepMine')}</span>
                                  ) : isAgent ? (
                                    <span className="muted">{t('coedit.resolvedTakeAgent')}</span>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                      <div className="dialog-actions">
                        <button
                          type="button"
                          onClick={() => handleReject(batch.id)}
                          data-testid="coedit-reject"
                        >
                          {t('coedit.reject')}
                        </button>
                        <button
                          type="button"
                          className="primary"
                          onClick={() => handleApprove(batch.id)}
                          data-testid="coedit-approve"
                        >
                          {t('coedit.approve')}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </section>

            <section className="coedit-section">
              <h3>{t('coedit.activityTitle')}</h3>
              {activity.length === 0 ? (
                <p className="muted">{t('coedit.noActivity')}</p>
              ) : (
                [...activity].reverse().map((entry) => {
                  const undoConflict = undoConflicts[entry.id]
                  return (
                    <div key={entry.id} className="coedit-card" data-testid="coedit-activity-item">
                      <div className="coedit-card-header">
                        <strong>{entry.summary}</strong>
                        <span className="muted">
                          {entry.authorLabel} ·{' '}
                          {tn('coedit.nodesAffected', entry.affectedNodeIds.length)}
                        </span>
                      </div>
                      {undoConflict && !undoConflict.ok ? (
                        <div className="coedit-conflict" role="alert">
                          <span>{t('coedit.undoConflict')}</span>{' '}
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleUndoEntry(entry.id, true)}
                            data-testid="coedit-force-undo"
                          >
                            {t('coedit.forceUndo')}
                          </button>
                        </div>
                      ) : null}
                      <div className="dialog-actions">
                        {entry.undone ? (
                          <span className="muted" data-testid="coedit-undone-tag">
                            {t('coedit.undoneTag')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUndoEntry(entry.id, false)}
                            data-testid="coedit-undo"
                          >
                            {t('coedit.undo')}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </section>

            <div className="dialog-actions">
              <button
                type="button"
                className="danger"
                onClick={() => disconnectBridge()}
                data-testid="coedit-disconnect"
              >
                {t('coedit.disconnect')}
              </button>
              <button type="button" onClick={onClose}>
                {t('coedit.close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
