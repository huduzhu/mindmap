import { useEffect, useId, useMemo, useRef } from 'react'
import { flattenTree } from '../outliner/flatten'
import { rowStep } from '../outliner/navigate'
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
import { RenameInput } from './RenameInput'
import { indentBracket } from './indentKeys'
import { roleLabel, t, useT } from '../i18n'
import '../i18n/en/outliner'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { OutlinerTouchBar } from './OutlinerTouchBar'
import { moveWhileRenaming, removeRow, rowActions } from './outlinerActions'
import type { TreeNode } from '../schema/types'
import { openNotes } from './detailsPanel'
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
import { tagRowClass, useTagRows } from '../outliner/tagRows'
import { deleteFocusedBranch, handleFocusKey, viewRootOf } from './focusActions'
import { revealNode } from '../search/reveal'
import { FocusBarHost } from './lazyDialogs'
import { isDone, markerColor } from '../map/marks'
import { useResolvedPreset } from '../hooks/usePreset'
import { NodeIcon } from './NodeMarks'
import { isToggleDoneKey, toggleTaskDone } from './taskActions'
import { dialogOpen } from './dialogOpen'

/** Outline rows get the Brainstorm buttons plus "On map" (#95). */
function outlineActions(map: TreeNode, id: string) {
  const actions = rowActions('map', map, id, (after) => createSibling(after, map.id))
  actions.push({
    id: 'map',
    label: 'touch.showOnMap',
    aria: 'touch.showOnMapLabel',
    icon: '◎',
    onClick: () => {
      useEditor.getState().setView('map')
      // Leaves the map's focus when the node is outside it (#146).
      revealNode(id)
    },
  })
  return actions
}

function createChild(parentId: string) {
  const node = makeNode(t('node.newIdea'))
  useEditor.getState().startDraft('map', node, (tree) => addChild(tree, parentId, node), parentId)
}

/** Enter: a sibling below `id`, or a child of the root the Outline shows (#146). */
function createSibling(id: string | null, rootId: string) {
  const node = makeNode(t('node.newIdea'))
  useEditor.getState().startDraft(
    'map',
    node,
    (tree) => {
      if (!id) return addChild(tree, rootId, node)
      const located = findNode(tree, id)
      if (!located) return tree
      return located.parent && id !== rootId ? addSibling(tree, id, node) : addChild(tree, id, node)
    },
    id,
  )
}

export function OutlineView() {
  useT() // re-render when the language changes (#89)
  const coarse = useCoarsePointer()
  const fullMap = useProjects((s) => s.current?.map)
  const palette = useResolvedPreset(useProjects((s) => s.current?.preset) ?? 'default').palette
  // The Outline can focus on one branch (#146): `map` is what it shows.
  const focusId = useEditor((s) => s.focus.outline)
  const map = useMemo(
    () => (fullMap ? viewRootOf(fullMap, focusId) : undefined),
    [fullMap, focusId],
  )
  const selection = useEditor((s) => s.selection)
  const editing = useEditor((s) => s.editing)
  const view = useEditor((s) => s.view)
  const activeSection = useEditor((s) => s.activeSection)
  const revealId = useEditor((s) => s.revealId)
  const revealNonce = useEditor((s) => s.revealNonce)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const treeId = useId()
  const rowId = (id: string) => `${treeId}-row-${id}`
  // The tag filter (#150): hide mode lists only the matches and their path.
  const tags = useTagRows('outline', map, editing)
  const shownMap = tags.shown
  const rows = useMemo(() => (shownMap ? flattenTree(shownMap) : []), [shownMap])

  useEffect(() => {
    if (!revealId || !revealNonce) return
    document
      .querySelector(`[data-testid="outline-row-${revealId}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [revealId, revealNonce])

  useEffect(() => {
    if (view !== 'split') useEditor.getState().setActiveSection('map')
  }, [view])

  // A selection the Outline does not show (made in the map outside this
  // focus, or folded away) is let go, as in Brainstorm (#195).
  useEffect(() => {
    if (view === 'split' && activeSection !== 'map') return
    if (selection && editing !== selection && !rows.some((r) => r.node.id === selection)) {
      useEditor.getState().select(null)
    }
  }, [activeSection, editing, rows, selection, view])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Nothing reaches the outline behind an open dialog (#166).
      if (dialogOpen()) return
      // Alt+. / Alt+, / Alt+1…3 fold the map's tree, shared with the map (#145).
      const owner = useEditor.getState()
      if (
        !(owner.view === 'split' && owner.activeSection !== 'map') &&
        handleFoldKey(e, 'map', map?.id)
      )
        return
      const target = e.target as HTMLElement | null
      if (
        target instanceof HTMLElement &&
        target.closest('button, input, textarea, select, a, [contenteditable="true"]')
      )
        return

      const editor = useEditor.getState()
      if (editor.view === 'split' && editor.activeSection !== 'map') return
      // Undo and redo, as on the map and in Brainstorm (#194).
      const undoCombo = e.ctrlKey || e.metaKey
      if (undoCombo && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
        return
      }
      if (undoCombo && !e.altKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        editor.redo()
        return
      }
      if (editor.editing || !map) return
      // Alt+→ focuses on the selected branch; Alt+← and Esc go back up (#146).
      if (handleFocusKey(e, 'outline')) return

      // Only a row the Outline shows is acted on (#195).
      const selectedId =
        editor.selection && rows.some((row) => row.node.id === editor.selection)
          ? editor.selection
          : null
      // Outdenting a child of a focused branch would take it out of view (#146).
      const leavesView = rows.find((row) => row.node.id === selectedId)?.parentId === map.id
      // Ctrl/Cmd+Enter marks a task done or not done (#148a).
      if (isToggleDoneKey(e)) {
        if (!selectedId) return
        e.preventDefault()
        toggleTaskDone('map', selectedId)
        return
      }
      // Folding (#145): Space / → / ← on a row.
      if (handleRowFoldKey(e, rows, selectedId, 'map')) return
      const bracket = indentBracket(e)
      if (bracket) {
        if (!selectedId) return
        e.preventDefault()
        if (bracket === 'outdent' && leavesView) return
        editor.applyTree('map', (tree) =>
          bracket === 'outdent' ? outdentNode(tree, selectedId) : indentNode(tree, selectedId),
        )
        return
      }
      switch (e.key) {
        case 'Escape':
          // Parity with the brainstorm outliner: keyboard users can deselect (#65).
          if (!selectedId) return
          e.preventDefault()
          editor.select(null)
          break
        case 'Enter':
          e.preventDefault()
          createSibling(selectedId, map.id)
          break
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault()
          // Alt+↑/↓ reorders among siblings, as in Brainstorm (#95).
          if (e.altKey) {
            if (selectedId)
              editor.applyTree('map', (tree) =>
                moveAmongSiblings(tree, selectedId, e.key === 'ArrowUp' ? -1 : 1),
              )
            break
          }
          // Plain ↑/↓ move between rows, as in Brainstorm (#134).
          const next = rowStep(rows, selectedId, e.key === 'ArrowDown' ? 'down' : 'up')
          if (next) editor.select(next)
          break
        }
        case 'F2':
          if (!selectedId || !rows.some((row) => row.node.id === selectedId)) return
          e.preventDefault()
          editor.setEditing(selectedId)
          break
        case 'Tab':
          if (!selectedId) return
          e.preventDefault()
          if (e.shiftKey && leavesView) break
          editor.applyTree('map', (tree) =>
            e.shiftKey ? outdentNode(tree, selectedId) : indentNode(tree, selectedId),
          )
          break
        case 'Delete':
        case 'Backspace': {
          // The outline shows the map tree, so the root is the document itself and
          // must not be removable — same guard the brainstorm outliner applies with
          // `sel === brainstorm.id`. Select the previous row (or the root) so focus
          // and the keyboard chain stay on a real node after the delete.
          if (!selectedId || !rows.some((row) => row.node.id === selectedId)) return
          if (selectedId === map.id) {
            // A focused branch's own row: delete the branch and leave focus (#146).
            if (map === fullMap) return
            e.preventDefault()
            deleteFocusedBranch('outline', selectedId)
            return
          }
          e.preventDefault()
          removeRow('map', map, selectedId)
          break
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // `rows` is memoized on `map`, so listing both does not churn the listener.
  }, [map, fullMap, rows])

  if (!map) return null
  // The selected row is the tree's active descendant (#135).
  const sectionActive = view !== 'split' || activeSection === 'map'
  const activeRow =
    sectionActive && selection && rows.some((row) => row.node.id === selection)
      ? rowId(selection)
      : undefined
  return (
    <div className="view-stack">
      <FocusBarHost view="outline" />
      <div
        ref={wrapperRef}
        className="outliner"
        tabIndex={0}
        role="tree"
        aria-label={t('outline.treeLabel')}
        aria-describedby={`${treeId}-hint`}
        aria-activedescendant={activeRow}
        onPointerDown={() => useEditor.getState().setActiveSection('map')}
        onFocus={() => {
          if (useEditor.getState().view === 'split') useEditor.getState().setActiveSection('map')
        }}
        data-testid="outline-view"
      >
        <div className="outliner-scroll">
          {rows.map((row) => (
            <div
              key={row.node.id}
              id={rowId(row.node.id)}
              role="treeitem"
              data-node-id={row.node.id}
              data-node-section="map"
              aria-describedby={row.node.image ? `${rowId(row.node.id)}-image` : undefined}
              aria-level={row.depth + 1}
              aria-selected={row.node.id === selection && sectionActive}
              aria-expanded={row.node.children?.length ? row.hidden === 0 : undefined}
              aria-labelledby={
                editing === row.node.id && sectionActive ? undefined : `${rowId(row.node.id)}-title`
              }
              className={`outliner-row${row.depth === 0 ? ' outliner-row-root' : ''}${row.node.id === selection && (view !== 'split' || activeSection === 'map') ? ' outliner-row-selected' : ''}${isDone(row.node) ? ' outliner-row-done' : ''}${tagRowClass(tags.result, tags.highlight, row.node.id)}`}
              style={{ paddingLeft: 16 + row.depth * 26 }}
              onClick={() => {
                const editor = useEditor.getState()
                editor.setActiveSection('map')
                // On touch the first tap selects (and shows the row buttons);
                // tapping the selected row renames it (#95).
                const wasSelected = editor.selection === row.node.id
                editor.select(row.node.id)
                if (!coarse || wasSelected) editor.setEditing(row.node.id)
              }}
              data-testid={`outline-row-${row.node.id}`}
            >
              <RowBullet
                row={row}
                isRoot={row.depth === 0}
                onToggle={() => {
                  useEditor.getState().setActiveSection('map')
                  toggleFold('map', row.node.id)
                  wrapperRef.current?.focus()
                }}
              />
              <RowAccent color={markerColor(palette, row.node.color)} />
              <RowCheck node={row.node} section="map" />
              {editing === row.node.id && (view !== 'split' || activeSection === 'map') ? (
                <RenameInput
                  initial={row.node.title}
                  className="outliner-input"
                  onCommit={(draft) => useEditor.getState().commitRename(row.node.id, draft)}
                  onTab={(shift) => moveWhileRenaming('map', row.node.id, shift, map.id)}
                  onToggleDone={() => toggleTaskDone('map', row.node.id)}
                  returnFocusRef={wrapperRef}
                />
              ) : (
                <>
                  <span className="outliner-title" id={`${rowId(row.node.id)}-title`}>
                    {row.node.icon ? <NodeIcon icon={row.node.icon} /> : null}
                    {row.node.title}
                  </span>
                  <RowTags node={row.node} colors={palette.branchColors} result={tags.result} />
                  <RowImage node={row.node} section="map" id={`${rowId(row.node.id)}-image`} />
                  <RowProgress node={row.node} />
                  <HiddenCount row={row} />
                </>
              )}
              {editing !== row.node.id || (view === 'split' && activeSection !== 'map') ? (
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
                    useEditor.getState().setActiveSection('map')
                    useEditor.getState().select(row.node.id)
                    openNotes()
                  }}
                  data-testid={`outline-note-trigger-${row.node.id}`}
                >
                  {row.node.notes ? '✎' : '+✎'}
                </button>
              ) : null}
              {row.node.role ? (
                <span className="muted outline-role"> {roleLabel(row.node.role)}</span>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="outliner-add"
            title={t('outline.addTitle')}
            onClick={() => {
              useEditor.getState().setActiveSection('map')
              // A selection that no longer names a node in this map (e.g. after
              // an undo removed it) falls back to the root instead of adding nothing.
              const selected = useEditor.getState().selection
              createChild(selected && findNode(map, selected) ? selected : map.id)
            }}
            data-testid="outline-add"
          >
            {t('outliner.add')}
          </button>
          <p className="outliner-hint" id={`${treeId}-hint`}>
            {coarse ? t('outline.touchHint') : t('outline.hint')}
          </p>
        </div>
        {coarse &&
        selection &&
        !editing &&
        (view !== 'split' || activeSection === 'map') &&
        findNode(map, selection) ? (
          <OutlinerTouchBar
            title={findNode(map, selection)!.node.title}
            actions={outlineActions(map, selection)}
          />
        ) : null}
      </div>
    </div>
  )
}
