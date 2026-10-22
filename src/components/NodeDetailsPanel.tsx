import { useEffect, useId, useRef, useState } from 'react'
import { MAX_NOTES_LENGTH, ROLES, SIDES, type Role, type Side } from '../schema/constants'
import type { TreeNode } from '../schema/types'
import { clampNotes, findNode, setNotes, setRole, setSide } from '../store/treeOps'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { notifyPendingEdits, registerPendingEdit } from '../store/pendingEdits'
import { renderNotesMarkdown } from '../notesMarkdown'
import { linkBetween, linkedIds, removeLinkBetween } from '../store/links'
import { editLinkLabel } from './linkActions'
import { useUi } from '../store/ui'
import { roleLabel, useT } from '../i18n'
import { hideDetailsPanel } from './detailsPanel'
import { isTask, markerColor, taskProgress } from '../map/marks'
import { useResolvedPreset } from '../hooks/usePreset'
import { toggleTaskDone } from './taskActions'
import { LazyNodeImageField, LazyNodeTagField } from './lazyDialogs'
import { NOTES_COMMIT_DELAY_MS, type PanelProps } from './NodeDetailsDialog'

/** The role dropdown's two groups: structural levels, then kinds of idea (live test, item 1). */
const STRUCTURE_ROLES: readonly Role[] = ['theme', 'main-branch', 'branch', 'leaf']
const KIND_ROLES: readonly Role[] = ROLES.filter((role) => !STRUCTURE_ROLES.includes(role))

export function NodeDetailsPanel({ section, node, isRoot, isDepth1, renaming }: PanelProps) {
  const t = useT()
  const isMap = section === 'map'
  const titleId = useId()
  const focusNotes = useEditor((s) => s.focusNotes)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const storeNotes = node.notes ?? ''
  const [notesDraft, setNotesDraft] = useState(storeNotes)
  const draftRef = useRef(notesDraft)
  // The notes value we last saw in (or wrote to) the store. Comparing the draft
  // against this — not against a mount-time capture — is what stops blur and
  // the unmount cleanup from both committing the same edit, and stops a stale
  // draft from re-committing text the user just undid (#45).
  const committedRef = useRef(storeNotes)

  // Keep the ref synced to the latest draft without touching it during render (oxlint).
  useEffect(() => {
    draftRef.current = notesDraft
  })

  // The Panel is keyed by node, so undo/redo on the same node does not remount
  // it. Follow external changes while the draft is clean; never clobber typing.
  useEffect(() => {
    if (storeNotes === committedRef.current) return
    const dirty = draftRef.current !== committedRef.current
    committedRef.current = storeNotes
    if (!dirty) {
      draftRef.current = storeNotes
      setNotesDraft(storeNotes)
    }
  }, [storeNotes])

  // No focus on plain selection — the old textarea autoFocus remounted on every selection
  // change and stole keys that should have been canvas/outliner shortcuts (#5). The textarea
  // is focused only when opened through the explicit notes affordance (focusNotes flag).
  useEffect(() => {
    if (focusNotes && !renaming) {
      notesRef.current?.focus()
      useEditor.getState().setFocusNotes(false)
    }
  }, [focusNotes, renaming])

  const commitNotes = () => {
    const draft = draftRef.current
    if (draft === committedRef.current) return
    committedRef.current = draft
    useEditor.getState().applyTree(section, (tree) => setNotes(tree, node.id, draft))
    notifyPendingEdits()
  }

  // Commit a half-typed draft when the selection moves away (the key remounts
  // the Panel). Uses refs only, so the first-render closure is safe. While the
  // Panel is open the draft is also registered as a pending edit, so leaving
  // the page sees it and commits it before saving (#92).
  useEffect(() => {
    const unregister = registerPendingEdit({
      isDirty: () => draftRef.current !== committedRef.current,
      flush: () => commitNotes(),
    })
    return () => {
      unregister()
      commitNotes()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [section, node.id])

  // Save as you type: commit after a short pause, so a reload or a closed tab
  // never loses what was typed, and each pause is one undo step (#92, N-D1).
  useEffect(() => {
    if (notesDraft === committedRef.current) return
    const timer = window.setTimeout(() => commitNotes(), NOTES_COMMIT_DELAY_MS)
    return () => window.clearTimeout(timer)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDraft])

  const onRoleChange = (next: string) => {
    const role: Role | undefined = next === '__none__' ? undefined : (next as Role)
    useEditor.getState().applyTree(section, (tree) => setRole(tree, node.id, role))
  }

  const progress = taskProgress(node)

  const onSideChange = (next: string) => {
    const side: Side | undefined = next === '__auto__' ? undefined : (next as Side)
    useEditor.getState().applyTree(section, (tree) => setSide(tree, node.id, side))
  }

  return (
    <aside
      className={`node-details${renaming ? ' node-details-inactive' : ''}`}
      data-testid="node-details"
      role="region"
      aria-labelledby={titleId}
      tabIndex={-1}
      inert={renaming}
    >
      <header className="node-details-header">
        <span className="muted node-details-section">
          {isMap ? t('details.map') : t('details.brainstorm')}
          {isRoot ? t('details.root') : ''}
        </span>
        <h3 id={titleId} className="node-details-title" data-testid="node-details-title">
          {node.icon ? `${node.icon} ` : ''}
          {node.title || t('details.untitled')}
        </h3>
        <button
          type="button"
          className="node-details-close"
          // Hides the panel but keeps the selection, so Tab and Enter keep working (#144).
          onClick={hideDetailsPanel}
          aria-label={t('details.close')}
          title={t('details.closeTitle')}
        >
          ×
        </button>
      </header>
      <div className="node-details-body">
        {isTask(node) || progress ? (
          <div className="node-details-task">
            {isTask(node) ? (
              <label className="node-details-check">
                <input
                  type="checkbox"
                  checked={node.done === true}
                  onChange={() => toggleTaskDone(section, node.id)}
                  data-testid="node-details-done"
                />
                <span>{t('details.done')}</span>
              </label>
            ) : null}
            {progress ? (
              <span className="muted" data-testid="node-details-progress">
                {t('task.progress', { ...progress })}
              </span>
            ) : null}
          </div>
        ) : null}
        {node.image ? <LazyNodeImageField section={section} node={node} /> : null}
        <NodeMarkers section={section} node={node} />
        <div className="node-details-field node-details-tags" data-testid="node-details-tags">
          <span aria-hidden>{t('details.tags')}</span>
          <LazyNodeTagField section={section} node={node} />
        </div>
        <label className="node-details-field">
          <span>{t('details.notes')}</span>
          <textarea
            ref={notesRef}
            value={notesDraft}
            onChange={(e) => {
              // Update the ref now, not after render, so a flush straight after
              // typing (pagehide) sees the latest text. maxLength already stops
              // typing and pasting past the cap; the clamp covers anything else.
              const value = clampNotes(e.target.value)
              draftRef.current = value
              setNotesDraft(value)
              notifyPendingEdits()
            }}
            onBlur={commitNotes}
            placeholder={isMap ? t('details.notesMap') : t('details.notesIdea')}
            rows={5}
            maxLength={MAX_NOTES_LENGTH}
            data-testid="node-details-notes"
          />
        </label>
        {/* Outside the label, so the field's name is "Notes", not the whole preview (#170). */}
        {notesDraft ? (
          <div className="node-details-notes-preview" data-testid="node-details-notes-preview">
            <span className="muted">{t('details.preview')}</span>
            <div dangerouslySetInnerHTML={{ __html: renderNotesMarkdown(notesDraft) }} />
          </div>
        ) : null}
        {isMap ? (
          <>
            <label className="node-details-field">
              <span>{t('details.role')}</span>
              <select
                value={node.role ?? '__none__'}
                onChange={(e) => onRoleChange(e.target.value)}
                disabled={isRoot}
                data-testid="node-details-role"
              >
                <option value="__none__">{t('details.none')}</option>
                {/* Where the node sits versus what kind of idea it is (live test, item 1). */}
                <optgroup label={t('details.roleStructure')}>
                  {STRUCTURE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('details.roleKind')}>
                  {KIND_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            {isRoot ? <p className="muted node-details-hint">{t('details.rootRole')}</p> : null}
            <label className="node-details-field">
              <span>{t('details.side')}</span>
              <select
                value={node.side ?? '__auto__'}
                onChange={(e) => onSideChange(e.target.value)}
                disabled={!isDepth1}
                data-testid="node-details-side"
              >
                <option value="__auto__">{t('details.auto')}</option>
                {SIDES.filter((s) => s !== 'auto').map((side) => (
                  <option key={side} value={side}>
                    {side === 'left' ? t('side.left') : t('side.right')}
                  </option>
                ))}
              </select>
            </label>
            {!isDepth1 ? <p className="muted node-details-hint">{t('details.sideHint')}</p> : null}
            <NodeLinks nodeId={node.id} />
          </>
        ) : (
          <p className="muted node-details-hint">{t('details.brainstormHint')}</p>
        )}
      </div>
    </aside>
  )
}

/** Colour and emoji marker of the node (#148b); each opens the picker. */
function NodeMarkers({ section, node }: { section: 'map' | 'brainstorm'; node: TreeNode }) {
  const t = useT()
  const presetRef = useProjects((s) => s.current?.preset) ?? 'default'
  const palette = useResolvedPreset(presetRef).palette
  const color = markerColor(palette, node.color)
  const title = node.title || t('common.untitled')
  const open = (kind: 'color' | 'icon') =>
    useUi.getState().setMarkerPicker({ section, id: node.id, kind })
  return (
    <div className="node-details-markers">
      <div className="node-details-field">
        <span>{t('marks.color')}</span>
        <button
          type="button"
          className="node-details-marker"
          aria-label={t('marks.colorTitle', { title })}
          onClick={() => open('color')}
          data-testid="node-details-color"
        >
          <span
            className={`node-details-swatch${color ? '' : ' node-details-swatch-none'}`}
            style={color ? { background: color } : undefined}
            aria-hidden
          />
          {node.color ? t('marks.colorN', { n: node.color }) : t('marks.noColor')}
        </button>
      </div>
      <div className="node-details-field">
        <span>{t('marks.marker')}</span>
        <button
          type="button"
          className="node-details-marker"
          aria-label={t('marks.markerTitle', { title })}
          onClick={() => open('icon')}
          data-testid="node-details-icon"
        >
          {node.icon ?? t('marks.noMarker')}
        </button>
      </div>
    </div>
  )
}

/** Cross-links of the selected map node, with remove buttons and "Link to…" (#90). */
function NodeLinks({ nodeId }: { nodeId: string }) {
  const t = useT()
  const project = useProjects((s) => s.current)
  const labelId = useId()
  if (!project) return null
  const others = linkedIds(project.links, nodeId)
  const titleOf = (id: string) => findNode(project.map, id)?.node.title || t('common.untitled')
  return (
    <div className="node-details-field node-details-links" role="group" aria-labelledby={labelId}>
      <span id={labelId}>{t('details.links')}</span>
      {others.length === 0 ? (
        <p className="muted node-details-hint">{t('details.noLinks')}</p>
      ) : (
        <ul className="node-links" data-testid="node-links">
          {others.map((other) => {
            const label = linkBetween(project.links, nodeId, other)?.label
            return (
              <li key={other}>
                <button
                  type="button"
                  className="node-link-go"
                  title={t('details.selectNode')}
                  onClick={() => {
                    const editor = useEditor.getState()
                    editor.select(other)
                    editor.ensureVisible(other)
                  }}
                >
                  ↔ {titleOf(other)}
                  {label ? (
                    <span className="node-link-label" data-testid={`node-link-label-${other}`}>
                      {label}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={t('details.editLinkLabel', { name: titleOf(other) })}
                  title={t('details.editLinkLabelTitle')}
                  onClick={() => void editLinkLabel(nodeId, other)}
                  data-testid={`node-link-edit-${other}`}
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={t('details.removeLink', { name: titleOf(other) })}
                  title={t('details.removeLinkTitle')}
                  onClick={() =>
                    useEditor
                      .getState()
                      .applyLinks((links) => removeLinkBetween(links, nodeId, other))
                  }
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <button
        type="button"
        className="node-link-add"
        onClick={() => useUi.getState().setLinkPickFrom(nodeId)}
      >
        {t('details.linkTo')}
      </button>
    </div>
  )
}
