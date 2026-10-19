import { useEffect } from 'react'
import { announce } from '../a11y/announcer'
import { t, tn } from '../i18n'
import {
  CLIPBOARD_MIME,
  copyPayload,
  parsePayload,
  pasteInto,
  payloadSize,
  payloadToText,
  textToPayload,
  topLevelSelection,
  type ClipboardPayload,
  type PasteMode,
} from '../map/clipboard'
import { useEditor, type Section } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode, removeNodes } from '../store/treeOps'
import { showToast } from './toastStore'
import { loadImages, pastesImage } from '../assets/intake'

/**
 * Copy, cut and paste of nodes (#101) for every view: keyboard (the
 * browser's own copy/cut/paste events, which carry the custom data type and
 * need no permission), the node menu, the palette and the touch More menu
 * (the async Clipboard API, with the last copy kept in memory for when the
 * browser will not let the page read the clipboard).
 */

/** The last copy, in memory: full data even where the clipboard only keeps text. */
let memory: { payload: ClipboardPayload; text: string } | null = null

export function resetClipboardMemory(): void {
  memory = null
}

function currentSection(): Section {
  const { view, activeSection } = useEditor.getState()
  if (view === 'map' || view === 'outline') return 'map'
  if (view === 'brainstorm') return 'brainstorm'
  return activeSection
}

function selectedIds(section: Section): string[] {
  const { selection, selectionSet } = useEditor.getState()
  const tree = useProjects.getState().current?.[section]
  if (!tree) return []
  const ids = new Set(selectionSet)
  if (selection) ids.add(selection)
  return [...ids].filter((id) => findNode(tree, id))
}

/** Put the selection in memory and return it with its text form; null if nothing is selected. */
export function copySelection(): { payload: ClipboardPayload; text: string } | null {
  const section = currentSection()
  const project = useProjects.getState().current
  if (!project) return null
  const payload = copyPayload(
    project[section],
    selectedIds(section),
    section === 'map' ? project.links : [],
  )
  if (!payload) return null
  memory = { payload, text: payloadToText(payload) }
  announce(tn('clipboard.copied', payloadSize(payload)))
  return memory
}

/** Copy, then remove the selection as one undo step. The root is never cut. */
export function cutSelection(): { payload: ClipboardPayload; text: string } | null {
  const section = currentSection()
  const tree = useProjects.getState().current?.[section]
  if (!tree) return null
  const removable = topLevelSelection(tree, selectedIds(section)).filter((n) => n.id !== tree.id)
  if (removable.length === 0) return null
  const copied = copySelectionOf(
    section,
    removable.map((n) => n.id),
  )
  if (!copied) return null
  const first = findNode(tree, removable[0].id)
  const editor = useEditor.getState()
  editor.applyTree(section, (current) =>
    removeNodes(
      current,
      removable.map((n) => n.id),
    ),
  )
  editor.select(first?.parent?.id ?? tree.id)
  return copied
}

function copySelectionOf(section: Section, ids: string[]) {
  const project = useProjects.getState().current
  if (!project) return null
  const payload = copyPayload(project[section], ids, section === 'map' ? project.links : [])
  if (!payload) return null
  memory = { payload, text: payloadToText(payload) }
  announce(tn('clipboard.cut', payloadSize(payload)))
  return memory
}

/** Paste as children of the selected node (or the root), or after it. */
export function pastePayload(payload: ClipboardPayload, mode: PasteMode): boolean {
  const section = currentSection()
  const project = useProjects.getState().current
  if (!project) return false
  const tree = project[section]
  const editor = useEditor.getState()
  const target = editor.selection && findNode(tree, editor.selection) ? editor.selection : tree.id
  const result = pasteInto(tree, target, payload, mode)
  if (!result) {
    showToast(t('clipboard.tooMany'), 'error')
    return false
  }
  editor.applyTree(section, () => result.tree, {
    addLinks: section === 'map' ? result.links : [],
  })
  editor.select(result.pasted[0])
  for (const id of result.pasted.slice(1)) editor.select(id, true)
  editor.ensureVisible(result.pasted[0])
  return true
}

/** What a paste should insert, from the clipboard's contents. */
export function payloadFromClipboard(custom: string, text: string): ClipboardPayload | null {
  if (custom) {
    const parsed = parsePayload(custom)
    if (parsed) return parsed
  }
  // Our own copy where only the text survived (the async Clipboard API, or a
  // browser that drops custom types): use the full data kept in memory.
  if (memory && text && text.trim() === memory.text.trim()) return memory.payload
  if (text.trim()) return textToPayload(text)
  return null
}

/** Node menu, palette and touch: write text through the async Clipboard API. */
export async function copyFromMenu(cut = false): Promise<void> {
  const copied = cut ? cutSelection() : copySelection()
  if (!copied) return
  try {
    await navigator.clipboard?.writeText(copied.text)
  } catch {
    // Kept in memory: Paste in this tab still works.
  }
}

export async function pasteFromMenu(mode: PasteMode): Promise<void> {
  let text = ''
  try {
    text = (await navigator.clipboard?.readText()) ?? ''
  } catch {
    // Reading may be refused; fall back to the last copy in this tab.
  }
  const payload = text ? payloadFromClipboard('', text) : (memory?.payload ?? null)
  if (!payload) {
    showToast(t('clipboard.empty'), 'info')
    return
  }
  pastePayload(payload, mode)
}

export function hasClipboardMemory(): boolean {
  return memory !== null
}

/** Only when nodes, not text, are what the user is working on. */
function ownsEvent(event: Event): boolean {
  const target = event.target as HTMLElement | null
  if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
    return false
  }
  const selection = document.getSelection()
  if (selection && !selection.isCollapsed && selection.toString().trim()) return false
  const { editing } = useEditor.getState()
  return Boolean(useProjects.getState().current) && !editing
}

/**
 * Ctrl/Cmd+C, X and V on nodes; Ctrl/Cmd+Shift+V pastes as siblings. Mounted
 * once for the open project.
 */
export function useNodeClipboard(): void {
  useEffect(() => {
    let siblingPaste = false
    const onKeyDown = (event: KeyboardEvent) => {
      siblingPaste =
        (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v'
    }
    const onCopy = (event: ClipboardEvent, cut: boolean) => {
      if (!ownsEvent(event)) return
      const copied = cut ? cutSelection() : copySelection()
      if (!copied || !event.clipboardData) return
      event.preventDefault()
      event.clipboardData.setData('text/plain', copied.text)
      event.clipboardData.setData(CLIPBOARD_MIME, JSON.stringify(copied.payload))
    }
    const onPaste = (event: ClipboardEvent) => {
      const mode: PasteMode = siblingPaste ? 'sibling' : 'child'
      siblingPaste = false
      if (!ownsEvent(event) || !event.clipboardData) return
      // A picture with no text (#149): it goes on the selected node, or on a
      // new node. Text, HTML and copied nodes paste as before.
      const picture = event.clipboardData.getData(CLIPBOARD_MIME)
        ? null
        : pastesImage(event.clipboardData)
      if (picture) {
        event.preventDefault()
        void loadImages().then((images) => images.pasteImage(picture))
        return
      }
      // An empty clipboard (some browsers and headless modes keep nothing):
      // fall back to the last copy made in this tab.
      const empty = event.clipboardData.types.length === 0
      const payload =
        empty && memory
          ? memory.payload
          : payloadFromClipboard(
              event.clipboardData.getData(CLIPBOARD_MIME),
              event.clipboardData.getData('text/plain'),
            )
      if (!payload) return
      event.preventDefault()
      pastePayload(payload, mode)
    }
    const copy = (event: ClipboardEvent) => onCopy(event, false)
    const cut = (event: ClipboardEvent) => onCopy(event, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', onPaste)
    }
  }, [])
}
