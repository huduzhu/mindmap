import { useId, useRef } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useUi } from '../store/ui'
import { useT, type MessageKey } from '../i18n'
import '../i18n/en/shortcuts'
import { keyLabel } from './keyLabels'

interface Shortcut {
  keys: string[]
  action: MessageKey
}

const SECTIONS: { title: MessageKey; items: Shortcut[] }[] = [
  {
    title: 'sc.map',
    items: [
      { keys: ['Tab'], action: 'sc.addChild' },
      { keys: ['Enter'], action: 'sc.addSibling' },
      { keys: ['F2'], action: 'sc.renameDbl' },
      { keys: ['Del'], action: 'sc.remove' },
      { keys: ['↑', '↓', '←', '→'], action: 'sc.moveMap' },
      // Windows keeps Alt+Tab for switching windows, so Ctrl+] comes first (#131).
      { keys: ['Ctrl+]', 'Alt+Tab'], action: 'sc.indent' },
      { keys: ['Ctrl+[', 'Alt+Shift+Tab'], action: 'sc.outdent' },
      { keys: ['Space'], action: 'sc.fold' },
      { keys: ['Shift+Space'], action: 'sc.image' },
      { keys: ['Alt+Shift+S'], action: 'sc.flip' },
      { keys: ['Shift+click'], action: 'sc.multi' },
      { keys: ['Shift+drag'], action: 'sc.boxSelect' },
      { keys: ['Shift+F10'], action: 'sc.menu' },
      { keys: ['Esc'], action: 'sc.deselect' },
    ],
  },
  {
    title: 'sc.brainstorm',
    items: [
      { keys: ['Enter'], action: 'sc.newIdea' },
      { keys: ['Tab', 'Ctrl+]'], action: 'sc.nest' },
      { keys: ['Shift+Tab', 'Ctrl+['], action: 'sc.unnest' },
      { keys: ['F2'], action: 'sc.rename' },
      { keys: ['Del'], action: 'sc.remove' },
      { keys: ['↑', '↓'], action: 'sc.move' },
      { keys: ['Alt+↑', 'Alt+↓'], action: 'sc.reorder' },
      { keys: ['Space', '→', '←'], action: 'sc.foldRow' },
    ],
  },
  {
    title: 'sc.outline',
    items: [
      { keys: ['Enter'], action: 'sc.addSibling' },
      { keys: ['Tab', 'Ctrl+]'], action: 'sc.indent' },
      { keys: ['Shift+Tab', 'Ctrl+['], action: 'sc.outdent' },
      { keys: ['F2'], action: 'sc.renameClick' },
      { keys: ['Del'], action: 'sc.remove' },
      { keys: ['↑', '↓'], action: 'sc.move' },
      { keys: ['Alt+↑', 'Alt+↓'], action: 'sc.reorder' },
      { keys: ['Space', '→', '←'], action: 'sc.foldRow' },
      { keys: ['Esc'], action: 'sc.deselect' },
    ],
  },
  {
    // Map, Outline and Brainstorm alike (#145, #146).
    title: 'sc.folding',
    items: [
      { keys: ['Alt+.'], action: 'sc.expandAll' },
      { keys: ['Alt+,'], action: 'sc.collapseAll' },
      { keys: ['Alt+1', 'Alt+2', 'Alt+3'], action: 'sc.showLevels' },
      // Focus on one branch (#146).
      { keys: ['Alt+→'], action: 'sc.focus' },
      { keys: ['Alt+←', 'Esc'], action: 'sc.focusUp' },
    ],
  },
  {
    title: 'sc.clipboard',
    items: [
      { keys: ['Ctrl+C'], action: 'sc.copy' },
      { keys: ['Ctrl+X'], action: 'sc.cut' },
      { keys: ['Ctrl+V'], action: 'sc.paste' },
      { keys: ['Ctrl+Shift+V'], action: 'sc.pasteSibling' },
      { keys: ['Ctrl+V'], action: 'sc.pasteImage' },
    ],
  },
  {
    title: 'sc.everywhere',
    items: [
      { keys: ['Ctrl+K'], action: 'sc.palette' },
      { keys: ['Ctrl+I'], action: 'sc.details' },
      { keys: ['Ctrl+F'], action: 'sc.find' },
      { keys: ['Enter', 'Shift+Enter'], action: 'sc.findNext' },
      { keys: ['Ctrl+Z'], action: 'sc.undo' },
      { keys: ['Ctrl+Y'], action: 'sc.redo' },
      // Map, Outline and Brainstorm, also while renaming (#148a).
      { keys: ['Ctrl+Enter'], action: 'sc.toggleDone' },
      // Node tags (#150): "Fix login #p1" saves the title "Fix login" tagged p1.
      { keys: ['#tag'], action: 'sc.hashTag' },
    ],
  },
  {
    // Presentation mode (#152).
    title: 'present.sc.title',
    items: [
      { keys: ['F5'], action: 'present.sc.start' },
      { keys: ['→', '↓', 'Space', 'PgDn', 'Enter'], action: 'present.sc.next' },
      { keys: ['←', '↑', 'PgUp', 'Backspace'], action: 'present.sc.previous' },
      { keys: ['Home', 'End'], action: 'present.sc.ends' },
      { keys: ['1…9', 'Enter'], action: 'present.sc.jump' },
      { keys: ['B', '.'], action: 'present.sc.blank' },
      { keys: ['N'], action: 'present.sc.notes' },
      { keys: ['Swipe'], action: 'present.sc.swipe' },
      { keys: ['Esc', 'Two-finger tap'], action: 'present.sc.exit' },
    ],
  },
  {
    title: 'sc.touch',
    items: [
      { keys: ['Tap'], action: 'sc.tap' },
      { keys: ['Double-tap'], action: 'sc.doubleTap' },
      { keys: ['Long-press'], action: 'sc.longPress' },
    ],
  },
]

/** All keyboard shortcuts in one place (#80; opened from the hint bar's "?" or Ctrl+K). */
export function ShortcutsHost() {
  const open = useUi((state) => state.shortcutsOpen)
  if (!open) return null
  return <ShortcutsDialog onClose={() => useUi.getState().setShortcutsOpen(false)} />
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useDialogA11y(dialogRef, {
    isOpen: true,
    onClose,
    labelledBy: titleId,
    initialFocusRef: closeRef,
  })
  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="dialog shortcuts-dialog" role="dialog">
        <h2 id={titleId}>{t('shortcuts.title')}</h2>
        <p className="muted">{t('shortcuts.mac')}</p>
        {SECTIONS.map((section) => (
          <section key={section.title} className="shortcuts-section">
            <h3>{t(section.title)}</h3>
            <dl className="shortcuts-list">
              {section.items.map((item) => (
                <div key={`${section.title}-${item.action}`} className="shortcuts-row">
                  <dt>
                    {item.keys.map((key) => (
                      <kbd key={key}>{keyLabel(key)}</kbd>
                    ))}
                  </dt>
                  <dd>{t(item.action)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <div className="dialog-actions">
          <button ref={closeRef} type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
