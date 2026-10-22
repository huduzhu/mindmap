/**
 * Loaders for the parts of the app kept out of the first download (#141):
 * the command palette (with its command list), the small root dialogs, the
 * map canvas (with React Flow and d3) and the Brainstorm and Outline views. `lazyDialogs.tsx` renders them; once the
 * app is idle `preloadLazyParts` fetches them, so opening one later does not
 * wait on the network.
 */
export const loadCommandPalette = () => import('./CommandPalette')
export const loadShortcutsDialog = () => import('./ShortcutsDialog')
export const loadLinkPicker = () => import('./LinkPicker')
export const loadPromptDialog = () => import('./PromptDialog')
export const loadChoiceDialog = () => import('./ChoiceDialog')
export const loadMindMapCanvas = () => import('./MindMapCanvas')
export const loadBrainstormOutliner = () => import('./BrainstormOutliner')
export const loadOutlineView = () => import('./OutlineView')
export const loadFocusBar = () => import('./FocusBar')
export const loadBranchExport = () => import('./BranchExportDialog')
export const loadMarkerPicker = () => import('./MarkerPicker')
export const loadPresentation = () => import('./PresentOverlay')
export const loadTagEditor = () => import('./TagEditor')
export const loadTagFilter = () => import('./TagFilterPanel')
export const loadImageLightbox = () => import('./ImageLightbox')
export const loadImageField = () => import('./NodeImageField')

type DetailsPanelModule = typeof import('./NodeDetailsPanel')
let detailsPanel: DetailsPanelModule | undefined
/** The details panel's body; kept once loaded so the panel can render without a pause. */
export const loadDetailsPanel = () =>
  import('./NodeDetailsPanel').then((module) => (detailsPanel = module))
export const loadedDetailsPanel = (): DetailsPanelModule | undefined => detailsPanel

const LOADERS = [
  loadBrainstormOutliner,
  loadOutlineView,
  loadCommandPalette,
  loadPromptDialog,
  loadChoiceDialog,
  loadShortcutsDialog,
  loadLinkPicker,
  loadFocusBar,
  loadBranchExport,
  loadMarkerPicker,
  loadPresentation,
  loadTagEditor,
  loadTagFilter,
  loadImageLightbox,
  loadImageField,
  loadDetailsPanel,
]

let preloaded = false

/**
 * Warm the module cache once the app is idle. Failures are ignored here: if a
 * part really is missing, opening it shows the update banner (#94).
 */
export function preloadLazyParts(): void {
  if (preloaded) return
  preloaded = true
  const run = () => {
    for (const load of LOADERS) void load().catch(() => undefined)
  }
  if (typeof globalThis.requestIdleCallback === 'function')
    globalThis.requestIdleCallback(run, { timeout: 3000 })
  else globalThis.setTimeout(run, 1000)
}
