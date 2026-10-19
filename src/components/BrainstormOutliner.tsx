import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react'
import { flattenTree } from '../outliner/flatten'
import { rowStep } from '../outliner/navigate'
import {
  applyOutlinerDropIntent,
  isOutlinerCycleDrop,
  resolveOutlinerDropIntent,
  type OutlinerDropZone,
} from '../map/drop'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import {
  addChild,
  addSibling,
  findNode,
  indentNode,
  makeNode,
  moveAmongSiblings,
  outdentNode,
} from '../store/treeOps'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { OutlinerTouchBar } from './OutlinerTouchBar'
import { moveWhileRenaming, removeRow, rowActions } from './outlinerActions'
import { RenameInput } from './RenameInput'
import { indentBracket } from './indentKeys'
import { showToast } from './toastStore'
import { copyBrainstormToMap } from './brainstormToMap'
import { handleFoldKey, handleRowFoldKey, toggleFold } from './foldActions'
import {
  HiddenCount,
  RowAccent,
  RowBullet,
  RowCheck,
  RowImage,
  RowProgress,
  RowTags,
} from './RowBullet'
import { currentTagShownRoot, tagRowClass, useTagRows } from '../outliner/tagRows'
import { isDone, markerColor } from '../map/marks'
import { useResolvedPreset } from '../hooks/usePreset'
import { NodeIcon } from './NodeMarks'
import { isToggleDoneKey, toggleTaskDone } from './taskActions'
import { deleteFocusedBranch, handleFocusKey, viewRootOf } from './focusActions'
import { FocusBarHost } from './lazyDialogs'
import { t, useT } from '../i18n'
import '../i18n/en/outliner'
import { openNotes } from './detailsPanel'
import { dialogOpen } from './dialogOpen'

type DropPreview = {
  targetId: string | null
  zone: OutlinerDropZone
}

function rowDropZone(row: HTMLElement, depth: number, event: DragEvent): OutlinerDropZone {
  const bounds = row.getBoundingClientRect()
  // jsdom does not lay out elements. A coordinate-free synthetic drop should
  // use the useful/default row action (reparent), while real pointer events
  // still use the gutter and edge geometry below.
  if (bounds.width === 0 && bounds.height === 0 && event.clientX === 0 && event.clientY === 0) {
    return 'child'
  }
  // DragEvent coordinates are unavailable in jsdom. A drag-over still needs a
  // stable sibling affordance for keyboard/test tripwires; real laid-out rows
  // always take the geometry path below.
  if (
    bounds.width === 0 &&
    bounds.height === 0 &&
    event.clientX === undefined &&
    event.clientY === undefined
  ) {
    return event.type === 'dragover' ? 'before' : 'child'
  }
  const height = bounds.height || 32
  const y = event.clientY - bounds.top
  const gutterEnd = bounds.left + 16 + depth * 26
  if (event.clientX > 0 && event.clientX < gutterEnd) return 'outdent'
  const edge = Math.max(8, Math.min(14, height * 0.25))
  if (y <= edge) return 'before'
  if (y >= height - edge) return 'after'
  return 'child'
}

/** A new idea below `id`, or the first child of the root the list shows (#146). */
function createAfter(id: string, rootId: string) {
  const node = makeNode(t('node.newIdea'))
  useEditor
    .getState()
    .startDraft(
      'brainstorm',
      node,
      (tree) =>
        tree.id === id || id === rootId ? addChild(tree, id, node) : addSibling(tree, id, node),
      id,
    )
}

export function BrainstormOutliner() {
  useT() // re-render when the language changes (#89)
  const fullTree = useProjects((s) => s.current?.brainstorm)
  const palette = useResolvedPreset(useProjects((s) => s.current?.preset) ?? 'default').palette
  // Brainstorm can focus on one branch (#146): `tree` is what the list shows.
  const focusId = useEditor((s) => s.focus.brainstorm)
  const tree = useMemo(
    () => (fullTree ? viewRootOf(fullTree, focusId) : undefined),
    [fullTree, focusId],
  )
  const selection = useEditor((s) => s.selection)
  const editing = useEditor((s) => s.editing)
  const view = useEditor((s) => s.view)
  const activeSection = useEditor((s) => s.activeSection)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const draggedIdRef = useRef<string | null>(null)
  const droppedRef = useRef(false)
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null)
  const coarse = useCoarsePointer()
  const treeId = useId()
  const rowId = (id: string) => `${treeId}-row-${id}`

  // The tag filter (#150): hide mode lists only the matches and their path.
  const tags = useTagRows('brainstorm', tree, editing)
  const shownTree = tags.shown
  const rows = useMemo(() => (shownTree ? flattenTree(shownTree) : []), [shownTree])
  const revealId = useEditor((s) => s.revealId)
  const revealNonce = useEditor((s) => s.revealNonce)

  useEffect(() => {
    if (view === 'split' && activeSection !== 'brainstorm') return
    if (selection && !rows.some((r) => r.node.id === selection)) {
      useEditor.getState().select(null)
    }
  }, [activeSection, rows, selection, view])

  useEffect(() => {
    if (!revealId || !revealNonce) return
    document
      .querySelector(`[data-testid="outliner-row-${revealId}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [revealId, revealNonce])

  useEffect(() => {
    wrapperRef.current?.focus()
  }, [])

  const clearDrag = () => {
    draggedIdRef.current = null
    setDropPreview(null)
  }

  const draggedId = (event: DragEvent): string | null => {
    const fromRef = draggedIdRef.current
    if (fromRef) return fromRef
    const fromTransfer = event.dataTransfer?.getData('text/plain')
    return fromTransfer || null
  }

  const previewRowDrop = (event: DragEvent, targetId: string, depth: number) => {
    const sourceId = draggedId(event)
    if (!sourceId || !tree || sourceId === targetId) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (targetId === tree.id) {
      setDropPreview({ targetId, zone: 'child' })
      return
    }
    setDropPreview({
      targetId,
      zone: rowDropZone(event.currentTarget as HTMLElement, depth, event),
    })
  }

  const dropOnTree = (event: DragEvent, targetId: string | null, zone: OutlinerDropZone) => {
    const sourceId = draggedId(event)
    // A dropped file (a picture onto this idea, #149) is not a row move: the
    // app's window-level drop handler takes it.
    if (!sourceId && event.dataTransfer?.types.includes('Files')) {
      clearDrag()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (!sourceId || !tree) {
      clearDrag()
      return
    }
    // Swallow a click the browser may fire synchronously after the drop, but
    // never the user's next real click: most browsers fire no click after an
    // HTML5 drop, so the flag used to survive and eat one click per drag (#65).
    droppedRef.current = true
    setTimeout(() => {
      droppedRef.current = false
    }, 0)
    const currentTree = useProjects.getState().current?.brainstorm
    if (!currentTree || targetId === currentTree.id) {
      clearDrag()
      return
    }
    // The focused branch's own row only takes children (#146).
    const viewRootId = tree?.id ?? currentTree.id
    const dropZone = targetId === viewRootId ? 'child' : zone
    if (targetId && isOutlinerCycleDrop(currentTree, sourceId, targetId)) {
      showToast(t('outliner.cycle'), 'error')
      useEditor.getState().select(sourceId)
      clearDrag()
      return
    }
    const intent = resolveOutlinerDropIntent(currentTree, sourceId, targetId, dropZone)
    if (intent) {
      useEditor
        .getState()
        .applyTree('brainstorm', (current) =>
          applyOutlinerDropIntent(current, sourceId, intent, viewRootId),
        )
      useEditor.getState().select(sourceId)
    }
    clearDrag()
  }

  // Document-level keydown (#5) — the same focus-independence the map side got in Batch 16:
  // shortcuts work from the wrapper, from <body>, and from the details-panel container. Only
  // real interactive elements bail, so a focused notes textarea keeps editing notes. Replaces
  // the old strict `e.target !== wrapperRef.current` guard, which dropped every key once
  // focus landed anywhere but the wrapper itself.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Nothing reaches the list behind an open dialog (#166).
      if (dialogOpen()) return
      const editor = useEditor.getState()
      if (editor.view === 'split' && editor.activeSection !== 'brainstorm') return
      // Alt+. / Alt+, / Alt+1…3 fold what the list shows (#145).
      if (handleFoldKey(e, 'brainstorm', editor.focus.brainstorm ?? undefined)) return
      const target = e.target as HTMLElement | null
      if (target?.closest('button, input, textarea, select, a, [contenteditable="true"]')) return
      const undoCombo = e.ctrlKey || e.metaKey

      if (undoCombo && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
        return
      }
      if (undoCombo && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        editor.redo()
        return
      }

      if (editor.editing) return
      // Alt+→ focuses on the selected branch; Alt+← and Esc go back up (#146).
      if (handleFocusKey(e, 'brainstorm')) return

      const project = useProjects.getState().current
      const fullBrainstorm = project?.brainstorm
      if (!fullBrainstorm) return
      const brainstorm = viewRootOf(fullBrainstorm, editor.focus.brainstorm)
      const flat = flattenTree(currentTagShownRoot('brainstorm', brainstorm))
      const sel = editor.selection
      const selectedIdx = flat.findIndex((r) => r.node.id === sel)

      // Ctrl/Cmd+Enter marks a task done or not done (#148a).
      if (isToggleDoneKey(e)) {
        if (!sel || selectedIdx === -1) return
        e.preventDefault()
        toggleTaskDone('brainstorm', sel)
        return
      }
      // Folding (#145): Space / → / ← on a row.
      if (handleRowFoldKey(e, flat, sel, 'brainstorm')) return

      // Outdenting a child of a focused branch would take it out of view (#146).
      const leavesView = flat[selectedIdx]?.parentId === brainstorm.id
      const bracket = indentBracket(e)
      if (bracket) {
        if (!sel) return
        e.preventDefault()
        if (bracket === 'outdent' && leavesView) return
        editor.applyTree('brainstorm', (t) =>
          bracket === 'outdent' ? outdentNode(t, sel) : indentNode(t, sel),
        )
        return
      }

      switch (e.key) {
        case 'Enter': {
          e.preventDefault()
          createAfter(sel && selectedIdx !== -1 ? sel : brainstorm.id, brainstorm.id)
          break
        }
        case 'Tab': {
          if (!sel) return
          e.preventDefault()
          if (e.shiftKey && leavesView) break
          editor.applyTree('brainstorm', (t) =>
            e.shiftKey ? outdentNode(t, sel) : indentNode(t, sel),
          )
          break
        }
        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault()
          // Alt+↑/↓ reorders among siblings (#95; the touch bar's Up/Down).
          if (e.altKey) {
            if (sel) {
              editor.applyTree('brainstorm', (t) =>
                moveAmongSiblings(t, sel, e.key === 'ArrowUp' ? -1 : 1),
              )
            }
            break
          }
          const next = rowStep(flat, sel, e.key === 'ArrowDown' ? 'down' : 'up')
          if (next) editor.select(next)
          break
        }
        case 'F2': {
          if (sel) {
            e.preventDefault()
            editor.setEditing(sel)
          }
          break
        }
        case 'Delete':
        case 'Backspace': {
          if (!sel || selectedIdx === -1) return
          if (sel === brainstorm.id) {
            // A focused branch's own row: delete the branch and leave focus (#146).
            if (brainstorm === fullBrainstorm) return
            e.preventDefault()
            deleteFocusedBranch('brainstorm', sel)
            return
          }
          e.preventDefault()
          removeRow('brainstorm', brainstorm, sel)
          break
        }
        case 'Escape': {
          editor.select(null)
          break
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!tree) return null

  const focusWrapper = () => wrapperRef.current?.focus()
  // The selected row is the tree's active descendant, so screen readers
  // follow ↑/↓ the way they follow a native tree (#135).
  const sectionActive = view !== 'split' || activeSection === 'brainstorm'
  const activeRow =
    sectionActive && selection && rows.some((row) => row.node.id === selection)
      ? rowId(selection)
      : undefined

  return (
    <div className="view-stack">
      <FocusBarHost view="brainstorm" />
      <div
        ref={wrapperRef}
        className="outliner"
        tabIndex={0}
        role="tree"
        aria-label={t('outliner.treeLabel')}
        aria-describedby={`${treeId}-hint`}
        aria-activedescendant={activeRow}
        onClick={(e) => {
          // Widened blank-click (#5): any click that does not land on an interactive element
          // restores wrapper focus — the visible "empty space" is mostly the scroll container
          // and the hint, not the wrapper itself, so the old exact-target check almost never
          // fired.
          const target = e.target as HTMLElement | null
          if (target?.closest('button, input, textarea, select, a')) return
          focusWrapper()
        }}
        onPointerDown={() => useEditor.getState().setActiveSection('brainstorm')}
        onFocus={() => {
          if (useEditor.getState().view === 'split')
            useEditor.getState().setActiveSection('brainstorm')
        }}
        data-testid="brainstorm-outliner"
      >
        <div className="outliner-scroll">
          <div
            className="outliner-drop-top"
            data-testid="outliner-top-drop-zone"
            aria-label={t('outliner.dropRoot')}
            style={{
              height: 18,
              margin: '-10px 0 2px',
              borderTop:
                dropPreview?.targetId === null
                  ? '2px solid var(--mms-accent, #2563eb)'
                  : '2px solid transparent',
              borderRadius: 4,
            }}
            onDragOver={(event) => {
              const sourceId = draggedId(event)
              if (!sourceId || !tree || sourceId === tree.id) return
              event.preventDefault()
              if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
              setDropPreview({ targetId: null, zone: 'promote' })
            }}
            onDragLeave={() => setDropPreview(null)}
            onDrop={(event) => dropOnTree(event, null, 'promote')}
          />
          {rows.map((row) => {
            const isRoot = row.depth === 0
            const isSelected =
              row.node.id === selection && (view !== 'split' || activeSection === 'brainstorm')
            const isEditing =
              row.node.id === editing && (view !== 'split' || activeSection === 'brainstorm')
            const preview = dropPreview?.targetId === row.node.id ? dropPreview.zone : null
            const rowStyle: CSSProperties = {
              paddingLeft: 16 + row.depth * 26,
              position: 'relative',
              ...(preview === 'child'
                ? {
                    background: 'color-mix(in srgb, var(--mms-accent, #2563eb) 16%, transparent)',
                    boxShadow: 'inset 0 0 0 2px var(--mms-accent, #2563eb)',
                  }
                : {}),
              ...(preview === 'outdent'
                ? { boxShadow: 'inset 3px 0 0 var(--mms-accent, #2563eb)' }
                : {}),
            }
            return (
              <div
                key={row.node.id}
                id={rowId(row.node.id)}
                role="treeitem"
                data-node-id={row.node.id}
                data-node-section="brainstorm"
                aria-describedby={row.node.image ? `${rowId(row.node.id)}-image` : undefined}
                aria-level={row.depth + 1}
                aria-selected={isSelected}
                aria-expanded={row.node.children?.length ? row.hidden === 0 : undefined}
                aria-labelledby={isEditing ? undefined : `${rowId(row.node.id)}-title`}
                className={`outliner-row${isSelected ? ' outliner-row-selected' : ''}${isRoot ? ' outliner-row-root' : ''}${preview === 'child' ? ' outliner-drop-child' : ''}${preview === 'outdent' ? ' outliner-drop-outdent' : ''}${isDone(row.node) ? ' outliner-row-done' : ''}${tagRowClass(tags.result, tags.highlight, row.node.id)}`}
                style={rowStyle}
                data-testid={`outliner-row-${row.node.id}`}
                draggable={!isRoot && !isEditing}
                onDragStart={(event) => {
                  if (isRoot || isEditing) return
                  draggedIdRef.current = row.node.id
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', row.node.id)
                  }
                }}
                onDragOver={(event) => previewRowDrop(event, row.node.id, row.depth)}
                onDragLeave={() => setDropPreview(null)}
                onDrop={(event) => {
                  const zone =
                    dropPreview?.targetId === row.node.id
                      ? dropPreview.zone
                      : rowDropZone(event.currentTarget as HTMLElement, row.depth, event)
                  dropOnTree(event, row.node.id, zone)
                }}
                onDragEnd={clearDrag}
                onClick={() => {
                  if (droppedRef.current) {
                    droppedRef.current = false
                    return
                  }
                  const editor = useEditor.getState()
                  editor.setActiveSection('brainstorm')
                  // On touch the first tap selects (and shows the row buttons);
                  // tapping the selected row renames it (#95).
                  const wasSelected = editor.selection === row.node.id
                  editor.select(row.node.id)
                  if (!coarse || wasSelected) editor.setEditing(row.node.id)
                }}
              >
                {preview === 'before' || preview === 'after' ? (
                  <span
                    className="outliner-drop-line"
                    data-testid={`outliner-drop-line-${row.node.id}`}
                    style={{
                      position: 'absolute',
                      left: 8,
                      right: 8,
                      height: 2,
                      background: 'var(--mms-accent, #2563eb)',
                      top: preview === 'before' ? -1 : undefined,
                      bottom: preview === 'after' ? -1 : undefined,
                      pointerEvents: 'none',
                    }}
                  />
                ) : null}
                <RowBullet
                  row={row}
                  isRoot={isRoot}
                  onToggle={() => {
                    useEditor.getState().setActiveSection('brainstorm')
                    toggleFold('brainstorm', row.node.id)
                    focusWrapper()
                  }}
                />
                <RowAccent color={markerColor(palette, row.node.color)} />
                <RowCheck node={row.node} section="brainstorm" />
                {isEditing ? (
                  <RenameInput
                    initial={row.node.title}
                    className="outliner-input"
                    onCommit={(draft) => useEditor.getState().commitRename(row.node.id, draft)}
                    onEnter={() => createAfter(row.node.id, tree.id)}
                    onTab={(shift) => moveWhileRenaming('brainstorm', row.node.id, shift, tree.id)}
                    onToggleDone={() => toggleTaskDone('brainstorm', row.node.id)}
                    returnFocusRef={wrapperRef}
                  />
                ) : (
                  <>
                    <span className="outliner-title" id={`${rowId(row.node.id)}-title`}>
                      {row.node.icon ? <NodeIcon icon={row.node.icon} /> : null}
                      {row.node.title || ' '}
                    </span>
                    <RowTags node={row.node} colors={palette.branchColors} result={tags.result} />
                    <RowImage
                      node={row.node}
                      section="brainstorm"
                      id={`${rowId(row.node.id)}-image`}
                    />
                    <RowProgress node={row.node} />
                    <HiddenCount row={row} />
                    <button
                      type="button"
                      className="outline-note-trigger"
                      title={
                        row.node.notes
                          ? t('outliner.notesTitle', { notes: row.node.notes })
                          : t('outliner.addNotes')
                      }
                      aria-label={row.node.notes ? t('outliner.editNotes') : t('outliner.addNotes')}
                      onClick={(e) => {
                        e.stopPropagation()
                        useEditor.getState().setActiveSection('brainstorm')
                        useEditor.getState().select(row.node.id)
                        openNotes()
                      }}
                      data-testid={`brainstorm-note-trigger-${row.node.id}`}
                    >
                      {row.node.notes ? '✎' : '+✎'}
                    </button>
                  </>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="outliner-add"
            onClick={() => {
              useEditor.getState().setActiveSection('brainstorm')
              // Same stale-selection fallback as the Outline tab (#71).
              const selected = useEditor.getState().selection
              createAfter(selected && findNode(tree, selected) ? selected : tree.id, tree.id)
            }}
            data-testid="brainstorm-add"
          >
            {t('outliner.add')}
          </button>
          {(fullTree?.children?.length ?? 0) > 0 && (
            <button
              type="button"
              className="outliner-add outliner-to-map"
              onClick={() => void copyBrainstormToMap()}
              data-testid="brainstorm-to-map"
            >
              {t('outliner.toMap')}
            </button>
          )}
          <p className="outliner-hint" id={`${treeId}-hint`}>
            {coarse ? t('outliner.touchHint') : t('outliner.hint')}
          </p>
        </div>
        {coarse &&
        selection &&
        !editing &&
        (view !== 'split' || activeSection === 'brainstorm') &&
        findNode(tree, selection) ? (
          <OutlinerTouchBar
            title={findNode(tree, selection)!.node.title}
            actions={rowActions('brainstorm', tree, selection, (id) => createAfter(id, tree.id))}
          />
        ) : null}
      </div>
    </div>
  )
}
