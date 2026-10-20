import { lazy, Suspense, type ComponentType } from 'react'
import type { TreeNode } from '../schema/types'
import { findNode } from '../store/treeOps'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { lazyImport } from '../pwa/update'
import { loadDetailsPanel, loadedDetailsPanel } from './lazyParts'

/** Pause after the last keystroke before notes are committed (#92). */
export const NOTES_COMMIT_DELAY_MS = 600

export interface DialogContext {
  section: 'map' | 'brainstorm'
  node: TreeNode
  isRoot: boolean
  isDepth1: boolean
}

export interface PanelProps extends DialogContext {
  /** The selected node is being renamed: the panel stays put, dimmed and inert (#144 GA3). */
  renaming: boolean
}

function locate(
  project: { map: TreeNode; brainstorm: TreeNode } | null | undefined,
  view: 'map' | 'brainstorm' | 'outline' | 'split',
  activeSection: 'map' | 'brainstorm',
  selection: string | null,
): DialogContext | null {
  if (!project || !selection) return null
  const section: 'map' | 'brainstorm' =
    view === 'brainstorm' || (view === 'split' && activeSection === 'brainstorm')
      ? 'brainstorm'
      : 'map'
  const tree = project[section]
  const found = findNode(tree, selection)
  if (!found) return null
  const isRoot = found.node.id === tree.id
  const isDepth1 = !isRoot && found.parent?.id === tree.id
  return { section, node: found.node, isRoot, isDepth1 }
}

type PanelModule = { default: ComponentType<PanelProps> }

/**
 * The panel's body is a separate chunk, preloaded after start-up with the other
 * lazy parts. Once it is loaded the panel renders in the same pass: the loader
 * hands React an already-settled thenable instead of a promise.
 */
const PanelChunk = lazy<ComponentType<PanelProps>>(() => {
  const ready = loadedDetailsPanel()
  if (ready) {
    const settled = {
      then: (resolve: (value: PanelModule) => void) => resolve({ default: ready.NodeDetailsPanel }),
    }
    return settled as unknown as Promise<PanelModule>
  }
  const none: PanelModule = { default: () => null }
  return lazyImport(loadDetailsPanel)
    .then((module): PanelModule => ({ default: module.NodeDetailsPanel }))
    .catch(() => none)
})

function DetailsPanel(props: PanelProps) {
  return (
    <Suspense fallback={null}>
      <PanelChunk {...props} />
    </Suspense>
  )
}

export function NodeDetailsDialog() {
  const project = useProjects((s) => s.current)
  const view = useEditor((s) => s.view)
  const activeSection = useEditor((s) => s.activeSection)
  const selection = useEditor((s) => s.selection)
  const editing = useEditor((s) => s.editing)
  const shown = useUi((s) => s.detailsPanel) === 'shown'
  const ctx = locate(project, view, activeSection, selection)
  if (!ctx || !shown) return null
  // key forces remount when the selected node changes — the inner body's cleanup then
  // commits the half-typed draft for the previous node, instead of losing it on re-render.
  // While the node is renamed the panel stays mounted (dimmed) so the view does not
  // jump as it appears and disappears around every rename (#144 GA3).
  return (
    <DetailsPanel key={`${ctx.section}:${ctx.node.id}`} {...ctx} renaming={selection === editing} />
  )
}
