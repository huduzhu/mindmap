import { create } from 'zustand'
import * as db from '../io/db'
import type { HistoryEntry, HistoryRecord } from '../io/db'
import type { NodeLink, TreeNode } from '../schema/types'
import { normalizeLinks } from './links'
import { findNode, renameNode } from './treeOps'
import { splitTrailingTags, type TagFilter } from '../map/tags'
import { t } from '../i18n'
import { announce } from '../a11y/announcer'
import { describeLinkChange, describeTreeChange } from '../a11y/describe'
import { isQuotaError } from '../io/quota'
import { saveErrorMessage, useProjects } from './projects'

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

export type Section = 'map' | 'brainstorm'
export type View = Section | 'outline' | 'split'
/** The views that can each focus on one branch (#146); split shows Brainstorm and Outline. */
export type FocusView = 'map' | 'outline' | 'brainstorm'

/** The focusable view the keyboard is in: in split view, the active pane. */
export function focusViewOf(view: View, activeSection: Section): FocusView {
  if (view === 'split') return activeSection === 'brainstorm' ? 'brainstorm' : 'outline'
  return view
}

/** The tree a focusable view shows: the map and Outline show the map. */
export function focusSection(view: FocusView): Section {
  return view === 'brainstorm' ? 'brainstorm' : 'map'
}

const NO_FOCUS: Record<FocusView, string | null> = { map: null, outline: null, brainstorm: null }
const NO_TAG_FILTER: Record<FocusView, TagFilter | null> = {
  map: null,
  outline: null,
  brainstorm: null,
}

const UNDO_LIMIT = 100
/**
 * Cap on the serialized size of each undo stack (UTF-16 code units, ~2 bytes
 * each). UNDO_LIMIT only capped the *count*; a schema-valid tree can be tens of
 * MB, so 100 full snapshots could reach gigabytes and end in
 * QuotaExceededError (#47). The newest entry is always kept. Subtrees shared
 * between entries count once (#142).
 */
export const HISTORY_CHAR_BUDGET = 4 * 1024 * 1024

export type { HistoryEntry }

let historyWrite: Promise<void> = Promise.resolve()
// The next record to write, if a write is queued but has not started yet.
// Rapid edits replace it instead of queueing one full-history write each (#47).
let queued: { record: HistoryRecord } | null = null

function persistHistory() {
  const { currentId } = useProjects.getState()
  if (!currentId) return
  const { past, future } = useEditor.getState()
  // No structuredClone: history entries are immutable (every tree op path-copies)
  // and IndexedDB's put() takes its own structured clone. Cloning here doubled
  // the cost of every keystroke-level edit (#47).
  const record: HistoryRecord = { projectId: currentId, past, future }
  if (queued && queued.record.projectId === record.projectId) {
    queued.record = record
    return
  }
  const slot = { record }
  queued = slot
  // The chain must never stay rejected: every store action awaits
  // `flushHistory()` first, so one failed write (e.g. QuotaExceededError) would
  // otherwise poison `init`, `loadProject`, `createProject`, … for the rest of
  // the session (#42). Recover the chain before each write and surface the
  // failure through `historyError` instead of swallowing it.
  historyWrite = historyWrite
    .catch(() => undefined)
    .then(() => {
      if (queued === slot) queued = null
      return db.putHistory(slot.record)
    })
    .then(
      () => {
        if (useEditor.getState().historyError !== null) useEditor.setState({ historyError: null })
      },
      (error: unknown) => {
        useEditor.setState({ historyError: saveErrorMessage(error) })
        if (isQuotaError(error)) void useProjects.getState().recoverStorage()
      },
    )
}

export async function flushHistory(): Promise<void> {
  await historyWrite
}

function sameLinks(a: NodeLink[] | undefined, b: NodeLink[] | undefined): boolean {
  if (a === b) return true
  if (!a?.length || !b?.length) return !a?.length && !b?.length
  return (
    a.length === b.length &&
    a.every((link, index) => link.from === b[index].from && link.to === b[index].to)
  )
}

// Serialized size of a node without its children, and of a links array.
// Entries are immutable, so each object is measured once.
const ownSizes = new WeakMap<object, number>()

function ownSize(node: TreeNode): number {
  let size = ownSizes.get(node)
  if (size === undefined) {
    const own: Partial<TreeNode> = { ...node }
    delete own.children
    // + the `"children":[…]` wrapper and separators.
    size = JSON.stringify(own).length + 16
    ownSizes.set(node, size)
  }
  return size
}

function linksSize(links: NodeLink[] | undefined, seen: WeakSet<object>): number {
  if (!links || seen.has(links)) return 0
  seen.add(links)
  let size = ownSizes.get(links)
  if (size === undefined) {
    size = JSON.stringify(links).length
    ownSizes.set(links, size)
  }
  return size
}

/** Size of the nodes in `root` not already counted in `seen` (#142). */
function treeSize(root: TreeNode | undefined, seen: WeakSet<object>): number {
  let size = 0
  const stack = root ? [root] : []
  while (stack.length > 0) {
    const node = stack.pop()!
    // Tree ops path-copy, so a node object seen before is a whole subtree
    // shared with an entry already counted.
    if (seen.has(node)) continue
    seen.add(node)
    size += ownSize(node)
    if (node.children) stack.push(...node.children)
  }
  return size
}

/**
 * What `entry` adds to a stack whose other entries put their objects in
 * `seen`: only nodes and link lists it does not share with them (#142).
 * Measuring each entry in full counted the shared part of the tree again in
 * every step, so a big map kept only a handful of undo steps.
 */
function entryNewSize(entry: HistoryEntry, seen: WeakSet<object>): number {
  return (
    32 +
    treeSize(entry.tree, seen) +
    treeSize(entry.map, seen) +
    treeSize(entry.brainstorm, seen) +
    linksSize(entry.links, seen) +
    linksSize(entry.projectLinks, seen)
  )
}

/** Characters an undo stack holds, counting structurally shared subtrees once. */
export function historyStackSize(entries: HistoryEntry[]): number {
  const seen = new WeakSet<object>()
  let total = 0
  for (let i = entries.length - 1; i >= 0; i -= 1) total += entryNewSize(entries[i], seen)
  return total
}

/** Keep at most UNDO_LIMIT entries and HISTORY_CHAR_BUDGET characters, newest first. */
function limitedPast(past: HistoryEntry[]): HistoryEntry[] {
  const capped = past.slice(-UNDO_LIMIT)
  const seen = new WeakSet<object>()
  let total = 0
  let start = capped.length
  while (start > 0) {
    const size = entryNewSize(capped[start - 1], seen)
    if (start < capped.length && total + size > HISTORY_CHAR_BUDGET) break
    total += size
    start -= 1
  }
  return start === 0 ? capped : capped.slice(start)
}

export interface EditorState {
  past: HistoryEntry[]
  future: HistoryEntry[]
  /** Last undo-history write failure, or null once a later write succeeds. */
  historyError: string | null
  selection: string | null
  selectionSet: Set<string>
  editing: string | null
  /**
   * A node just created for naming (Tab, Enter, "+ Add idea"…). Escape while
   * naming it discards it instead of leaving a "New idea" behind.
   */
  draft: { id: string; section: Section; returnTo: string | null } | null
  view: View
  activeSection: Section
  capturing: boolean
  focusNotes: boolean
  /**
   * The branch each view is focused on (#146), shown as if it were the root;
   * null shows the whole tree. Per session only (decision GC-D1): never saved.
   */
  focus: Record<FocusView, string | null>
  setFocus: (view: FocusView, id: string | null) => void
  /**
   * The tag filter of each view (#150, HB4); null (or no tags picked) shows
   * every node. Per view and per session only: never saved, cleared with the
   * project. Read it through `activeTagFilter`.
   */
  tagFilter: Record<FocusView, TagFilter | null>
  setTagFilter: (view: FocusView, filter: TagFilter | null) => void
  select: (id: string | null, additive?: boolean) => void
  toggleSelection: (id: string) => void
  revealId: string | null
  revealNonce: number
  setEditing: (id: string | null) => void
  setView: (view: View) => void
  setActiveSection: (section: Section) => void
  setCapturing: (capturing: boolean) => void
  setFocusNotes: (focusNotes: boolean) => void
  reveal: (id: string) => void
  ensureVisible: (id: string) => void
  commitRename: (id: string, draft: string) => void
  /** Insert `node` with `insert` (one undo step), select it and start naming it. */
  startDraft: (
    section: Section,
    node: TreeNode,
    insert: (tree: TreeNode) => TreeNode,
    returnTo?: string | null,
  ) => void
  /** Escape on a draft: take the insert back as if it never happened. */
  discardDraft: (id: string) => boolean
  /**
   * One undoable tree edit. `addLinks` adds cross-links in the same step (a
   * paste that brings its own links, #101); map only.
   */
  applyTree: (
    section: Section,
    mutator: (tree: TreeNode) => TreeNode,
    options?: { addLinks?: NodeLink[] },
  ) => void
  applyLinks: (mutator: (links: NodeLink[]) => NodeLink[]) => void
  /**
   * Apply a view-only change (collapse/expand) to a section. It is saved with
   * the project but is not an undo step (owner decision B2, #47 follow-up).
   */
  applyView: (section: Section, mutator: (tree: TreeNode) => TreeNode) => void
  replaceTrees: (map: TreeNode, brainstorm: TreeNode, links?: NodeLink[]) => boolean
  loadHistory: (record: HistoryRecord | undefined) => void
  /** Drop the redo stack and the older half of the undo stack, then persist (#48). */
  shrinkHistory: () => void
  undo: () => void
  redo: () => void
  /**
   * The node last selected in each section, so switching views keeps your
   * place instead of leaving nothing selected (#96).
   */
  lastSelection: Record<Section, string | null>
  resetTransient: () => void
  reset: () => void
}

export const useEditor = create<EditorState>()((set, get) => ({
  past: [],
  future: [],
  historyError: null,
  selection: null,
  selectionSet: new Set(),
  editing: null,
  draft: null,
  view: 'map',
  activeSection: 'map',
  lastSelection: { map: null, brainstorm: null },
  capturing: false,
  focusNotes: false,
  revealId: null,
  revealNonce: 0,
  focus: NO_FOCUS,
  tagFilter: NO_TAG_FILTER,

  setTagFilter: (view, filter) =>
    set((state) => ({
      tagFilter: { ...state.tagFilter, [view]: filter },
    })),

  setFocus: (view, id) =>
    set((state) => {
      const tree = useProjects.getState().current?.[focusSection(view)]
      // Focusing the root is the same as no focus.
      const next = !id || !tree || id === tree.id || !findNode(tree, id) ? null : id
      return state.focus[view] === next ? state : { focus: { ...state.focus, [view]: next } }
    }),

  select: (id, additive = false) =>
    set((state) => {
      if (!id || !additive) return { selection: id, selectionSet: id ? new Set([id]) : new Set() }

      // Keep the primary selection stable while Shift-click adds/removes secondary nodes.
      // Seed the set from selection as well so callers restoring older state still behave
      // correctly when they make their first additive selection.
      const selected = new Set(state.selectionSet)
      if (state.selection) selected.add(state.selection)
      if (selected.has(id)) {
        selected.delete(id)
        const nextPrimary =
          state.selection === id ? (selected.values().next().value ?? null) : state.selection
        return { selection: nextPrimary, selectionSet: selected }
      }
      selected.add(id)
      return { selection: state.selection ?? id, selectionSet: selected }
    }),
  toggleSelection: (id) => get().select(id, true),
  setEditing: (id) => set({ editing: id }),
  setView: (view) =>
    set((state) => {
      const activeSection: Section = view === 'map' || view === 'outline' ? 'map' : 'brainstorm'
      // Keep a place to work from (#96): the node last selected in the section
      // being shown, or its root when that node is gone or there was none —
      // so Tab and Enter work straight after switching.
      const tree = useProjects.getState().current?.[activeSection]
      const remembered = state.lastSelection[activeSection]
      const selection = !tree
        ? null
        : remembered && findNode(tree, remembered)
          ? remembered
          : tree.id
      return {
        view,
        activeSection,
        selection,
        selectionSet: selection ? new Set([selection]) : new Set<string>(),
        editing: null,
        focusNotes: false,
      }
    }),
  setActiveSection: (activeSection) =>
    set((state) =>
      state.activeSection === activeSection
        ? state
        : {
            activeSection,
            selection: null,
            selectionSet: new Set(),
            editing: null,
            focusNotes: false,
          },
    ),
  setCapturing: (capturing) => set({ capturing }),
  setFocusNotes: (focusNotes) => set({ focusNotes }),
  reveal: (id) =>
    set((state) => ({
      selection: id,
      // The found node becomes the whole selection, so the map highlights it (#147).
      selectionSet: new Set([id]),
      editing: null,
      revealId: id,
      revealNonce: state.revealNonce + 1,
    })),

  // Pan a node into view without touching `selection` or `editing`. The canvas
  // calls this immediately after a shortcut creates a node and opens its rename
  // input, so `reveal` is unusable there: its `editing: null` would cancel the
  // rename the user just started, and its transient selection-before-layout state
  // trips the stale-selection guard in MindMapCanvas.
  //
  // Without it the node is laid out beyond the visible canvas (the details panel
  // takes the right-hand strip), and `onlyRenderVisibleElements` culls it the
  // moment `editing` clears — so a node you just created and named silently
  // vanishes from the canvas.
  ensureVisible: (id) => set((state) => ({ revealId: id, revealNonce: state.revealNonce + 1 })),

  commitRename: (id, draft) => {
    // Trailing "#word" tokens become tags (#150, HB-D1), in the same undo step.
    const { title, tags } = splitTrailingTags(draft)
    set((state) => ({ editing: null, draft: state.draft?.id === id ? null : state.draft }))
    if (!title) return
    const view = get().view
    const section: Section =
      view === 'brainstorm' || (view === 'split' && get().activeSection === 'brainstorm')
        ? 'brainstorm'
        : 'map'
    get().applyTree(section, (tree) => renameNode(tree, id, title, tags))
  },

  startDraft: (section, node, insert, returnTo = null) => {
    get().applyTree(section, insert)
    const tree = useProjects.getState().current?.[section]
    if (!tree || !findNode(tree, node.id)) return
    set({ draft: { id: node.id, section, returnTo } })
    get().select(node.id)
    get().setEditing(node.id)
  },

  discardDraft: (id) => {
    const { draft, past } = get()
    const project = useProjects.getState().current
    const entry = past[past.length - 1]
    set({ draft: null, editing: null })
    if (!draft || draft.id !== id || !project || !entry?.tree || entry.section !== draft.section)
      return false
    // Only if the newest undo step is exactly the insert of this node.
    if (findNode(entry.tree, id) || !findNode(project[draft.section], id)) return false
    const section = draft.section
    const hasLinks = Object.prototype.hasOwnProperty.call(entry, 'projectLinks')
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      [section]: entry.tree!,
      ...(section === 'map' && hasLinks ? { links: entry.projectLinks } : {}),
    }))
    set((state) => ({ past: state.past.slice(0, -1) }))
    persistHistory()
    const back = draft.returnTo && findNode(entry.tree, draft.returnTo) ? draft.returnTo : null
    get().select(back ?? entry.tree.id)
    announce(t('announce.discarded'))
    return true
  },

  applyTree: (section, mutator, options) => {
    const project = useProjects.getState().current
    if (!project) return
    const before = project[section]
    const after = mutator(before)
    if (after === before) return
    const beforeLinks = project.links
    const added = options?.addLinks ?? []
    const nextLinks =
      section === 'map'
        ? normalizeLinks(after, added.length > 0 ? [...(beforeLinks ?? []), ...added] : beforeLinks)
        : beforeLinks
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      [section]: after,
      ...(section === 'map' ? { links: nextLinks } : {}),
    }))
    set((state) => ({
      past: limitedPast([
        ...state.past,
        { section, tree: before, ...(section === 'map' ? { projectLinks: beforeLinks } : {}) },
      ]),
      future: [],
    }))
    persistHistory()
    announce(describeTreeChange(before, after))
  },

  applyLinks: (mutator) => {
    const project = useProjects.getState().current
    if (!project) return
    const before = project.links ?? []
    const candidate = mutator(before)
    if (candidate === before) return
    const after = normalizeLinks(project.map, candidate) ?? []
    if (
      after.length === before.length &&
      after.every((link, index) => {
        const previous = before[index]
        return (
          previous?.from === link.from && previous.to === link.to && previous.label === link.label
        )
      })
    )
      return
    useProjects.getState().updateCurrent((p) => ({
      ...p,
      links: after.length > 0 ? after : undefined,
    }))
    set((state) => ({
      past: limitedPast([...state.past, { section: 'links', links: before }]),
      future: [],
    }))
    persistHistory()
    announce(describeLinkChange(project.map, before, after))
  },

  applyView: (section, mutator) => {
    const project = useProjects.getState().current
    if (!project) return
    const before = project[section]
    const after = mutator(before)
    if (after === before) return
    useProjects.getState().updateCurrent((p) => ({ ...p, [section]: after }))
    announce(describeTreeChange(before, after))
  },

  replaceTrees: (map, brainstorm, links) => {
    const project = useProjects.getState().current
    if (!project) return false
    // Snapshots can be older than the current tree, so their links may point at
    // nodes that no longer exist; normalize like applyTree/applyLinks do (#54).
    const nextLinks = normalizeLinks(map, links)
    if (
      project.map === map &&
      project.brainstorm === brainstorm &&
      sameLinks(project.links, nextLinks)
    )
      return false
    useProjects.getState().updateCurrent((p) => ({ ...p, map, brainstorm, links: nextLinks }))
    set((state) => ({
      past: limitedPast([
        ...state.past,
        {
          section: 'snapshot',
          map: project.map,
          brainstorm: project.brainstorm,
          projectLinks: project.links,
        },
      ]),
      future: [],
      editing: null,
    }))
    persistHistory()
    return true
  },

  loadHistory: (record) => {
    set({
      past: limitedPast(record?.past ?? []),
      future: limitedPast(record?.future ?? []),
      editing: null,
    })
  },

  shrinkHistory: () => {
    set((state) => ({ past: state.past.slice(Math.floor(state.past.length / 2)), future: [] }))
    persistHistory()
  },

  undo: () => {
    const project = useProjects.getState().current
    const { past } = get()
    if (!project || past.length === 0) return
    let change: string | null = null
    const entry = past[past.length - 1]
    if (entry.section === 'snapshot' && entry.map && entry.brainstorm) {
      change = t('announce.snapshotRestore')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: entry.map!,
        brainstorm: entry.brainstorm!,
        links: entry.projectLinks,
      }))
      set((state) => ({
        past: state.past.slice(0, -1),
        future: [
          ...state.future,
          {
            section: 'snapshot',
            map: project.map,
            brainstorm: project.brainstorm,
            projectLinks: project.links,
          },
        ],
        editing: null,
      }))
    } else if ((entry.section === 'map' || entry.section === 'brainstorm') && entry.tree) {
      const section = entry.section
      const current = project[section]
      change = describeTreeChange(current, entry.tree)
      const hasLinks = Object.prototype.hasOwnProperty.call(entry, 'projectLinks')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        [section]: entry.tree!,
        ...(section === 'map' && hasLinks ? { links: entry.projectLinks } : {}),
      }))
      set((state) => ({
        past: state.past.slice(0, -1),
        future: [
          ...state.future,
          {
            section,
            tree: current,
            ...(section === 'map' ? { projectLinks: project.links } : {}),
          },
        ],
        editing: null,
      }))
    } else if (entry.section === 'links' && entry.links) {
      change = describeLinkChange(project.map, project.links ?? [], entry.links)
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        links: entry.links!.length > 0 ? entry.links : undefined,
      }))
      set((state) => ({
        past: state.past.slice(0, -1),
        future: [...state.future, { section: 'links', links: project.links ?? [] }],
        editing: null,
      }))
    } else {
      return
    }
    persistHistory()
    announce(
      change ? t('announce.undone', { change: lowerFirst(change) }) : t('announce.undoneBare'),
    )
  },

  redo: () => {
    const project = useProjects.getState().current
    const { future } = get()
    if (!project || future.length === 0) return
    let change: string | null = null
    const entry = future[future.length - 1]
    if (entry.section === 'snapshot' && entry.map && entry.brainstorm) {
      change = t('announce.snapshotRestore')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: entry.map!,
        brainstorm: entry.brainstorm!,
        links: entry.projectLinks,
      }))
      set((state) => ({
        future: state.future.slice(0, -1),
        past: limitedPast([
          ...state.past,
          {
            section: 'snapshot',
            map: project.map,
            brainstorm: project.brainstorm,
            projectLinks: project.links,
          },
        ]),
        editing: null,
      }))
    } else if ((entry.section === 'map' || entry.section === 'brainstorm') && entry.tree) {
      const section = entry.section
      const current = project[section]
      change = describeTreeChange(current, entry.tree)
      const hasLinks = Object.prototype.hasOwnProperty.call(entry, 'projectLinks')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        [section]: entry.tree!,
        ...(section === 'map' && hasLinks ? { links: entry.projectLinks } : {}),
      }))
      set((state) => ({
        future: state.future.slice(0, -1),
        past: limitedPast([
          ...state.past,
          {
            section,
            tree: current,
            ...(section === 'map' ? { projectLinks: project.links } : {}),
          },
        ]),
        editing: null,
      }))
    } else if (entry.section === 'links' && entry.links) {
      change = describeLinkChange(project.map, project.links ?? [], entry.links)
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        links: entry.links!.length > 0 ? entry.links : undefined,
      }))
      set((state) => ({
        future: state.future.slice(0, -1),
        past: limitedPast([...state.past, { section: 'links', links: project.links ?? [] }]),
        editing: null,
      }))
    } else {
      return
    }
    persistHistory()
    announce(
      change ? t('announce.redone', { change: lowerFirst(change) }) : t('announce.redoneBare'),
    )
  },

  resetTransient: () =>
    set({
      lastSelection: { map: null, brainstorm: null },
      selection: null,
      selectionSet: new Set(),
      editing: null,
      draft: null,
      capturing: false,
      focusNotes: false,
      focus: NO_FOCUS,
      tagFilter: NO_TAG_FILTER,
    }),

  reset: () => {
    set({
      past: [],
      future: [],
      draft: null,
      lastSelection: { map: null, brainstorm: null },
      selection: null,
      selectionSet: new Set(),
      editing: null,
      capturing: false,
      focusNotes: false,
      focus: NO_FOCUS,
      tagFilter: NO_TAG_FILTER,
      revealId: null,
      revealNonce: 0,
    })
    persistHistory()
  },
}))

// Remember the selection per section for setView (#96).
useEditor.subscribe((state, previous) => {
  if (!state.selection || state.selection === previous.selection) return
  const section: Section =
    state.view === 'map' || state.view === 'outline'
      ? 'map'
      : state.view === 'brainstorm'
        ? 'brainstorm'
        : state.activeSection
  if (state.lastSelection[section] === state.selection) return
  useEditor.setState({ lastSelection: { ...state.lastSelection, [section]: state.selection } })
})

// A focused branch that is deleted (or undone away) leaves focus (#146), and
// another project starts with none. Cheap: only runs while a view is focused.
useProjects.subscribe((state, previous) => {
  if (state.current === previous.current) return
  const { focus } = useEditor.getState()
  if (!focus.map && !focus.outline && !focus.brainstorm) return
  if (state.currentId !== previous.currentId) {
    useEditor.setState({ focus: NO_FOCUS })
    return
  }
  let next = focus
  for (const view of ['map', 'outline', 'brainstorm'] as const) {
    const id = focus[view]
    const tree = state.current?.[focusSection(view)]
    if (id && (!tree || !findNode(tree, id))) next = { ...next, [view]: null }
  }
  if (next !== focus) useEditor.setState({ focus: next })
})
