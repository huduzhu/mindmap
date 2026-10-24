import { mainBranchSide } from '../map/layout'
import type { TreeNode } from '../schema/types'

/**
 * Presentation mode (#152): the pure part, shared by the app and the HTML
 * export's viewer. Nothing here touches the project, the editor or the DOM.
 */

/** One step shows one more node; `parent` is the node whose children are being revealed. */
export interface PresentStep {
  id: string
  parent: string | null
}

/**
 * The tree with every fold opened, for the presentation only (HA2). Subtrees
 * with nothing folded keep their objects, so the layout's size cache holds.
 */
export function unfoldAll(node: TreeNode): TreeNode {
  const children = node.children
  if (!children || children.length === 0) {
    if (!node.collapsed) return node
    const open = { ...node }
    delete open.collapsed
    return open
  }
  let changed = Boolean(node.collapsed)
  const next = children.map((child) => {
    const open = unfoldAll(child)
    if (open !== child) changed = true
    return open
  })
  if (!changed) return node
  const open = { ...node, children: next }
  delete open.collapsed
  return open
}

/**
 * The main branches clockwise from the top: the right side top to bottom,
 * then the left side bottom to top (decision HA-D1).
 */
function clockwise(root: TreeNode): TreeNode[] {
  const children = root.children ?? []
  const right: TreeNode[] = []
  const left: TreeNode[] = []
  children.forEach((child, index) => {
    if (mainBranchSide(child, index, children.length) === 'right') right.push(child)
    else left.push(child)
  })
  return [...right, ...left.reverse()]
}

/**
 * The order a map is presented in (HA-D1): the central topic, then each
 * node's children one step each before going into the first of them, depth
 * first, with the main branches taken clockwise. Folds are ignored: folded
 * branches are presented too.
 */
export function presentationSteps(root: TreeNode): PresentStep[] {
  const steps: PresentStep[] = [{ id: root.id, parent: null }]
  // An explicit stack instead of recursion, so a very deep map cannot overflow.
  const stack: TreeNode[][] = [[root]]
  while (stack.length > 0) {
    const level = stack[stack.length - 1]
    if (!level) break
    const node = level.shift()
    if (!node) {
      stack.pop()
      continue
    }
    const children = node === root ? clockwise(root) : (node.children ?? [])
    if (children.length === 0) continue
    for (const child of children) steps.push({ id: child.id, parent: node.id })
    stack.push([...children])
  }
  return steps
}

/** Where step `index` stands: what is shown, what is lit, what the camera fits. */
export interface StepView {
  index: number
  current: string
  /** Every node shown so far (steps 0…index). */
  revealed: Set<string>
  /** Shown at full strength: the current node, its ancestors and the group being revealed. */
  lit: Set<string>
  /** The node whose children are being revealed (the current node at the start). */
  group: string
  /** What the camera fits: the group and its children revealed so far. */
  fit: string[]
}

export function stepView(steps: PresentStep[], index: number): StepView {
  const at = clampStep(index, steps.length)
  const parentOf = new Map<string, string | null>()
  const revealed = new Set<string>()
  for (const shown of steps.slice(0, at + 1)) {
    revealed.add(shown.id)
    parentOf.set(shown.id, shown.parent)
  }
  const step = steps[at] ?? { id: '', parent: null }
  const group = step.parent ?? step.id
  const fit = [group]
  for (const shown of steps.slice(0, at + 1)) if (shown.parent === group) fit.push(shown.id)
  const lit = new Set(fit)
  for (let id: string | null | undefined = step.id; id; id = parentOf.get(id)) lit.add(id)
  return { index: at, current: step.id, revealed, lit, group, fit }
}

export function clampStep(index: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(total - 1, Math.max(0, Math.floor(index)))
}

/** The step that presents node `id`, or the first step. */
export function stepOf(steps: PresentStep[], id: string | null | undefined): number {
  if (!id) return 0
  const index = steps.findIndex((step) => step.id === id)
  return index < 0 ? 0 : index
}

/** The keys (HA4). Enter is "next" unless a step number is being typed. */
export type PresentKeyAction =
  | 'next'
  | 'previous'
  | 'first'
  | 'last'
  | 'enter'
  | 'blank'
  | 'notes'
  | 'exit'
  | 'erase'
  | `digit${number}`

export function presentKeyAction(event: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}): PresentKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  const key = event.key
  if (/^[0-9]$/.test(key)) return `digit${Number(key)}`
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case ' ':
    case 'Spacebar':
    case 'PageDown':
      return 'next'
    case 'Enter':
      return 'enter'
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return 'previous'
    case 'Backspace':
      return 'erase'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    case 'b':
    case 'B':
    case '.':
      return 'blank'
    case 'n':
    case 'N':
      return 'notes'
    case 'Escape':
      return 'exit'
    default:
      return null
  }
}

/** What the presentation remembers between steps; never part of the project. */
export interface PresentState {
  index: number
  blank: boolean
  captions: boolean
  /** Digits typed so far for "number, then Enter". */
  typed: string
  /** Bumped on every input, so the progress bar shows again and fades 2 s later. */
  inputs: number
  hud: boolean
}

/** Each action that moves carries the number of steps, which can change under it. */
export type PresentAction =
  | { type: 'key'; action: Exclude<PresentKeyAction, 'exit'>; total: number }
  | { type: 'next' | 'previous'; total: number }
  | { type: 'wake' }
  | { type: 'hideHud' }

export function initialPresentState(index: number, total: number): PresentState {
  return {
    index: clampStep(index, total),
    blank: false,
    captions: false,
    typed: '',
    inputs: 0,
    hud: true,
  }
}

function go(state: PresentState, index: number, total: number): PresentState {
  return {
    ...state,
    index: clampStep(index, total),
    blank: false,
    typed: '',
    inputs: state.inputs + 1,
    hud: true,
  }
}

export function presentReducer(state: PresentState, action: PresentAction): PresentState {
  if (action.type === 'hideHud') return state.hud ? { ...state, hud: false } : state
  const shown = { ...state, inputs: state.inputs + 1, hud: true }
  if (action.type === 'wake') return shown
  const { total } = action
  const at = clampStep(state.index, total)
  if (action.type !== 'key') return go(state, action.type === 'next' ? at + 1 : at - 1, total)
  const key = action.action
  if (key.startsWith('digit')) return { ...shown, typed: (state.typed + key.slice(5)).slice(-6) }
  switch (key) {
    case 'next':
      return go(state, at + 1, total)
    case 'previous':
      return go(state, at - 1, total)
    case 'erase':
      // Backspace takes back a typed digit first, then goes back a step.
      return state.typed ? { ...shown, typed: state.typed.slice(0, -1) } : go(state, at - 1, total)
    case 'first':
      return go(state, 0, total)
    case 'last':
      return go(state, total - 1, total)
    case 'enter':
      return state.typed ? go(state, Number(state.typed) - 1, total) : go(state, at + 1, total)
    case 'blank':
      return { ...shown, blank: !state.blank, typed: '' }
    case 'notes':
      return { ...shown, captions: !state.captions, typed: '' }
    default:
      return shown
  }
}

/** The words the presentation needs; the app and the viewer each supply their own. */
export type PresentTextKey =
  | 'label'
  | 'step'
  | 'stepUnder'
  | 'notesSpoken'
  | 'counter'
  | 'goTo'
  | 'progress'
  | 'previous'
  | 'next'
  | 'exit'
  | 'blanked'
  | 'controls'
  | 'done'
  | 'notDone'
  | 'tasks'

export type PresentText = (key: PresentTextKey, params?: Record<string, string | number>) => string

/** "Step 12 of 48: Pricing, under Launch", plus the notes when captions are on (HA7). */
export function stepAnnouncement(
  text: PresentText,
  index: number,
  total: number,
  title: string,
  parentTitle: string | null,
  notes: string | null,
): string {
  const params = { n: index + 1, total, title }
  const said = parentTitle
    ? text('stepUnder', { ...params, parent: parentTitle })
    : text('step', params)
  return notes ? `${said} ${text('notesSpoken', { notes })}` : said
}
