import { lazy, Suspense, useEffect, type ComponentProps, type ComponentType } from 'react'
import { useT } from '../i18n'
import { lazyImport } from '../pwa/update'
import type { ExportForAiDialog } from './ExportForAiDialog'
import type { PresetsDialog } from './PresetsDialog'
import type { SnapshotsDialog } from './SnapshotsDialog'
import type { SyncDialog } from './SyncDialog'
import type { GitHubDialog } from './GitHubDialog'
import { openSyncDialog, useSync } from '../sync/store'
import type { TrashDialog } from './TrashDialog'
import { useUi } from '../store/ui'
import { useEditor, type FocusView, type Section } from '../store/editor'
import type { TreeNode } from '../schema/types'
import { settlePrompt, usePrompt } from './promptStore'
import { settleChoice, useChoice } from './choiceStore'
import {
  loadBrainstormOutliner,
  loadBranchExport,
  loadChoiceDialog,
  loadFocusBar,
  loadCommandPalette,
  loadLinkPicker,
  loadMarkerPicker,
  loadOutlineView,
  loadPresentation,
  loadPromptDialog,
  loadShortcutsDialog,
  loadTagEditor,
  loadTagFilter,
  loadImageLightbox,
  loadImageField,
} from './lazyParts'
import { stopPresentation } from './presentActions'

/**
 * When a dialog's chunk can't be fetched (#94) the update banner explains and
 * offers a reload; the dialog just closes instead of crashing the app.
 */
function ChunkFailed({ onClose }: { onClose: () => void }) {
  useEffect(() => onClose(), [onClose])
  return null
}

function lazyDialog<P extends { onClose: () => void }>(
  loader: () => Promise<{ default: ComponentType<P> }>,
) {
  const fallback = { default: ChunkFailed as unknown as ComponentType<P> }
  return lazy<ComponentType<P>>(() => lazyImport(loader).catch(() => fallback))
}

/**
 * Rarely opened dialogs are separate chunks (#88). They are precached by the
 * service worker like every other chunk, so they still open offline.
 */
const PresetsDialogChunk = lazyDialog<ComponentProps<typeof PresetsDialog>>(() =>
  import('./PresetsDialog').then((m) => ({ default: m.PresetsDialog })),
)
const ExportForAiDialogChunk = lazyDialog<ComponentProps<typeof ExportForAiDialog>>(() =>
  import('./ExportForAiDialog').then((m) => ({ default: m.ExportForAiDialog })),
)
const SnapshotsDialogChunk = lazyDialog<ComponentProps<typeof SnapshotsDialog>>(() =>
  import('./SnapshotsDialog').then((m) => ({ default: m.SnapshotsDialog })),
)
const SyncDialogChunk = lazyDialog<ComponentProps<typeof SyncDialog>>(() =>
  import('./SyncDialog').then((m) => ({ default: m.SyncDialog })),
)
const GitHubDialogChunk = lazyDialog<ComponentProps<typeof GitHubDialog>>(() =>
  import('./GitHubDialog').then((m) => ({ default: m.GitHubDialog })),
)
const TrashDialogChunk = lazyDialog<ComponentProps<typeof TrashDialog>>(() =>
  import('./TrashDialog').then((m) => ({ default: m.TrashDialog })),
)

/*
 * The palette and the small root dialogs (#141). Each chunk holds the dialog's
 * own host, which reads the same store state; the eager hosts below only
 * decide whether to fetch it.
 */
type Closable = { onClose: () => void }
const CommandPaletteChunk = lazyDialog<Closable>(() =>
  loadCommandPalette().then((m) => ({ default: m.CommandPalette })),
)
const ShortcutsChunk = lazyDialog<Closable>(() =>
  loadShortcutsDialog().then((m) => ({ default: m.ShortcutsHost })),
)
const LinkPickerChunk = lazyDialog<Closable>(() =>
  loadLinkPicker().then((m) => ({ default: m.LinkPickerHost })),
)
const PromptChunk = lazyDialog<Closable>(() =>
  loadPromptDialog().then((m) => ({ default: m.PromptHost })),
)
const ChoiceChunk = lazyDialog<Closable>(() =>
  loadChoiceDialog().then((m) => ({ default: m.ChoiceHost })),
)
const BranchExportChunk = lazyDialog<Closable>(() =>
  loadBranchExport().then((m) => ({ default: m.BranchExportHost })),
)
const MarkerPickerChunk = lazyDialog<Closable>(() =>
  loadMarkerPicker().then((m) => ({ default: m.MarkerPickerHost })),
)
const PresentationChunk = lazyDialog<Closable>(() =>
  loadPresentation().then((m) => ({ default: m.PresentOverlay })),
)
const TagDialogChunk = lazyDialog<Closable>(() =>
  loadTagEditor().then((m) => ({ default: m.TagDialogHost })),
)
const ImageLightboxChunk = lazyDialog<Closable>(() =>
  loadImageLightbox().then((m) => ({ default: m.ImageLightboxHost })),
)
/** The tag field of the details panel and the filter bar (#150) load on first use. */
/** A part shown in place (not a dialog); renders nothing if its chunk fails. */
function lazyPart<P extends object, M>(
  loader: () => Promise<M>,
  pick: (module: M) => ComponentType<P>,
) {
  const none = { default: (() => null) as ComponentType<P> }
  return lazy<ComponentType<P>>(() =>
    lazyImport(loader)
      .then((module) => ({ default: pick(module) }))
      .catch(() => none),
  )
}
const NodeTagFieldChunk = lazyPart(loadTagEditor, (m) => m.NodeTagField)
const NodeImageFieldChunk = lazyPart(loadImageField, (m) => m.NodeImageField)
const TagFilterChunk = lazyPart(loadTagFilter, (m) => m.TagFilterPanel)
const TagFilterChipChunk = lazyPart(loadTagFilter, (m) => m.TagFilterChip)
/** The breadcrumb bar (#146) is only fetched once a view is focused. */
const FocusBarChunk = lazyPart(loadFocusBar, (m) => m.FocusBar)

/** The Brainstorm and Outline views (#141): only needed outside the map view. */
function ViewFailed() {
  const t = useT()
  return <div className="view-loading">{t('update.chunk')}</div>
}
function lazyView(loader: () => Promise<{ default: ComponentType }>) {
  const fallback = { default: ViewFailed }
  return lazy(() => lazyImport(loader).catch(() => fallback))
}
const BrainstormOutlinerChunk = lazyView(() =>
  loadBrainstormOutliner().then((m) => ({ default: m.BrainstormOutliner })),
)
const OutlineViewChunk = lazyView(() => loadOutlineView().then((m) => ({ default: m.OutlineView })))

function ViewLoading() {
  const t = useT()
  return (
    <div className="view-loading" role="status" aria-live="polite">
      {t('common.loading')}
    </div>
  )
}

function Loading() {
  const t = useT()
  return (
    <div className="dialog-backdrop">
      <div className="dialog dialog-loading" role="status" aria-live="polite">
        {t('common.loading')}
      </div>
    </div>
  )
}

export function LazyPresetsDialog(props: ComponentProps<typeof PresetsDialogChunk>) {
  return (
    <Suspense fallback={<Loading />}>
      <PresetsDialogChunk {...props} />
    </Suspense>
  )
}

export function LazyExportForAiDialog(props: ComponentProps<typeof ExportForAiDialogChunk>) {
  return (
    <Suspense fallback={<Loading />}>
      <ExportForAiDialogChunk {...props} />
    </Suspense>
  )
}

export function LazyTrashDialog(props: ComponentProps<typeof TrashDialogChunk>) {
  return (
    <Suspense fallback={<Loading />}>
      <TrashDialogChunk {...props} />
    </Suspense>
  )
}

export function LazySnapshotsDialog(props: ComponentProps<typeof SnapshotsDialogChunk>) {
  return (
    <Suspense fallback={<Loading />}>
      <SnapshotsDialogChunk {...props} />
    </Suspense>
  )
}

/** The Sync folder dialog (#107), opened from the badge, menus and palette. */
export function SyncHost() {
  const open = useSync((s) => s.dialogOpen)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <SyncDialogChunk onClose={() => openSyncDialog(false)} />
    </Suspense>
  )
}

export function LazyGitHubDialog(props: ComponentProps<typeof GitHubDialogChunk>) {
  return (
    <Suspense fallback={<Loading />}>
      <GitHubDialogChunk {...props} />
    </Suspense>
  )
}

export function LazyBrainstormOutliner() {
  return (
    <Suspense fallback={<ViewLoading />}>
      <BrainstormOutlinerChunk />
    </Suspense>
  )
}

export function LazyOutlineView() {
  return (
    <Suspense fallback={<ViewLoading />}>
      <OutlineViewChunk />
    </Suspense>
  )
}

/** Ctrl/Cmd+K (#141: fetched on first use). Mounted once at the App root. */
export function CommandPaletteHost() {
  const open = useUi((s) => s.paletteOpen)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <CommandPaletteChunk onClose={() => useUi.getState().setPaletteOpen(false)} />
    </Suspense>
  )
}

export function ShortcutsHost() {
  const open = useUi((s) => s.shortcutsOpen)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <ShortcutsChunk onClose={() => useUi.getState().setShortcutsOpen(false)} />
    </Suspense>
  )
}

export function LinkPickerHost() {
  const from = useUi((s) => s.linkPickFrom)
  if (!from) return null
  return (
    <Suspense fallback={<Loading />}>
      <LinkPickerChunk onClose={() => useUi.getState().setLinkPickFrom(null)} />
    </Suspense>
  )
}

export function PromptHost() {
  const open = usePrompt((s) => s.request !== null)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <PromptChunk onClose={() => settlePrompt(null)} />
    </Suspense>
  )
}

export function ChoiceHost() {
  const open = useChoice((s) => s.request !== null)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <ChoiceChunk onClose={() => settleChoice(null)} />
    </Suspense>
  )
}

/** "Export this branch…" (#146), opened from the node menu or the palette. */
export function BranchExportHost() {
  const open = useUi((s) => s.branchExport !== null)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <BranchExportChunk onClose={() => useUi.getState().setBranchExport(null)} />
    </Suspense>
  )
}

/** "Colour…" / "Marker…" for one node (#148b), from the node menu, palette or details. */
export function MarkerPickerHost() {
  const open = useUi((s) => s.markerPicker !== null)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <MarkerPickerChunk onClose={() => useUi.getState().setMarkerPicker(null)} />
    </Suspense>
  )
}

/** The breadcrumb bar above a view focused on one branch (#146). */
export function FocusBarHost({ view }: { view: FocusView }) {
  const focused = useEditor((s) => s.focus[view] !== null)
  if (!focused) return null
  return (
    <Suspense fallback={null}>
      <FocusBarChunk view={view} />
    </Suspense>
  )
}

/** Presentation mode (#152): F5, the toolbar's Present button or the palette. */
export function PresentationHost() {
  const open = useUi((s) => s.presenting !== null)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <PresentationChunk onClose={stopPresentation} />
    </Suspense>
  )
}

/** "Tags…" and "Add tag to selection" (#150), from the node menu or the palette. */
export function TagDialogHost() {
  const open = useUi((s) => s.tagEditor !== null)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <TagDialogChunk onClose={() => useUi.getState().setTagEditor(null)} />
    </Suspense>
  )
}

/** The image lightbox (#149): a thumbnail click, Space / Shift+Space, the menus. */
export function ImageLightboxHost() {
  const open = useUi((s) => s.imageViewer !== null)
  if (!open) return null
  return (
    <Suspense fallback={<Loading />}>
      <ImageLightboxChunk onClose={() => useUi.getState().setImageViewer(null)} />
    </Suspense>
  )
}

/** The details panel's tag field (#150). */
export function LazyNodeTagField({ section, node }: { section: Section; node: TreeNode }) {
  return (
    <Suspense fallback={null}>
      <NodeTagFieldChunk section={section} node={node} />
    </Suspense>
  )
}

/** The details panel's picture (#149), only for a node that has one. */
export function LazyNodeImageField({ section, node }: { section: Section; node: TreeNode }) {
  return (
    <Suspense fallback={null}>
      <NodeImageFieldChunk section={section} node={node} />
    </Suspense>
  )
}

/** The toolbar's tag filter bar (#150) for the view the keyboard is in. */
export function TagFilterHost({ view }: { view: FocusView }) {
  const open = useUi((s) => s.tagPanelOpen)
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <TagFilterChunk view={view} onClose={() => useUi.getState().setTagPanelOpen(false)} />
    </Suspense>
  )
}

/** The toolbar chip of an active tag filter (#150); the filter bar has loaded it already. */
export function TagFilterChipHost({ view }: { view: FocusView }) {
  return (
    <Suspense fallback={null}>
      <TagFilterChipChunk view={view} />
    </Suspense>
  )
}
