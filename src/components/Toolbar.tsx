import { useEffect, useId, useRef, useState } from 'react'
import { lazyImport } from '../pwa/update'
import {
  exportFreemindFile,
  exportHtmlFile,
  exportImageFile,
  exportMarkdownFile,
  exportMarkdownZip,
  exportOpmlFile,
  exportProjectJson,
  exportProjectZip,
  printProjectFile,
} from './exportActions'
import { pickFile } from '../io/files'
import { useResolvedPreset } from '../hooks/usePreset'
import { focusViewOf, useEditor } from '../store/editor'
import { activeTagFilter } from '../map/tags'
import { treeHasImage } from '../map/image'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import {
  LazyExportForAiDialog,
  LazyGitHubDialog,
  LazyPresetsDialog,
  LazySnapshotsDialog,
  TagFilterChipHost,
  TagFilterHost,
} from './lazyDialogs'
import { SyncBadge } from './SyncBadge'
import { openSyncDialog, requestSync } from '../sync/store'
import { RenameInput } from './RenameInput'
import { IMPORT_ACCEPT, importAndAnnounce } from './importFile'
import { ConfirmDialog } from './ConfirmDialog'
import { StudioSearch } from './StudioSearch'
import { toggleDetailsPanel } from './detailsPanel'
import { startPresentation } from './presentActions'
import { askSaveAs, askSnapshotName } from './projectPrompts'
import { showToast } from './toastStore'
import { useT } from '../i18n'
import { connectionLabel, saveStatusLabel } from './toolbarLabels'
import { ToolbarMenu, type ToolbarMenuItem } from './ToolbarMenu'
import { tabKeyTarget } from './tablistKeys'

export function Toolbar() {
  const t = useT()
  const currentId = useProjects((s) => s.currentId)
  const current = useProjects((s) => s.current)
  const snapshots = useProjects((s) => s.snapshots)
  const saveStatus = useProjects((s) => s.saveStatus)
  const saveError = useProjects((s) => s.saveError)
  const historyError = useEditor((s) => s.historyError)
  const storageFull = useProjects((s) => s.storageFull)
  const pastCount = useEditor((s) => s.past.length)
  const futureCount = useEditor((s) => s.future.length)
  const view = useEditor((s) => s.view)
  const preset = useResolvedPreset(current?.preset ?? 'default')
  // Palette-openable dialogs live in the ui store so the command palette (mounted
  // at the App root) can trigger them; purely local popovers stay here.
  const aiDialogOpen = useUi((s) => s.aiDialogOpen)
  const setAiDialogOpen = useUi((s) => s.setAiDialogOpen)
  const presetsOpen = useUi((s) => s.presetsOpen)
  const setPresetsOpen = useUi((s) => s.setPresetsOpen)
  const renamingProject = useUi((s) => s.renamingProject)
  const setRenamingProject = useUi((s) => s.setRenamingProject)
  const deleteOpen = useUi((s) => s.deleteOpen)
  const setDeleteOpen = useUi((s) => s.setDeleteOpen)
  const [busy, setBusy] = useState(false)
  const snapshotsOpen = useUi((s) => s.snapshotsOpen)
  const githubOpen = useUi((s) => s.githubOpen)
  const detailsShown = useUi((s) => s.detailsPanel) === 'shown'
  // The tag filter (#150) of the view the keyboard is in.
  const activeSection = useEditor((s) => s.activeSection)
  const filterView = focusViewOf(view, activeSection)
  const tagFilterOn = useEditor((s) => activeTagFilter(s.tagFilter[filterView]) !== null)
  const tagPanelOpen = useUi((s) => s.tagPanelOpen)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreId = useId()

  const tabs: { id: 'map' | 'brainstorm' | 'outline'; label: string }[] = [
    { id: 'map', label: t('view.map') },
    { id: 'brainstorm', label: t('view.brainstorm') },
    { id: 'outline', label: t('view.outline') },
  ]
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const onTablistKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const idx = tabRefs.current.findIndex((el) => el === target)
    const next = idx === -1 ? -1 : tabKeyTarget(e.key, idx, tabs.length)
    if (next === -1) return
    e.preventDefault()
    const id = tabs[next].id
    useEditor.getState().setView(id)
    tabRefs.current[next]?.focus()
  }

  useEffect(() => {
    if (saveStatus === 'error' && saveError) {
      showToast(t('toast.saveFailed', { error: saveError }), 'error', 9000)
    }
  }, [saveStatus, saveError, t])

  useEffect(() => {
    // Storage is full even after the recovery ladder: get the user's work out
    // of the browser before the tab dies (#48).
    if (!storageFull) return
    // The whole library goes out, not just the open project (#82): if the
    // browser later evicts the site's data, everything is in the ZIP.
    const project = useProjects.getState().current
    if (!project) return
    void lazyImport(() => import('../io/backup'))
      .then((backup) => backup.downloadLibraryBackup())
      .catch(() => exportProjectJson(project))
      .finally(() => showToast(t('toast.storageFull', { name: project.name }), 'error', 15000))
  }, [storageFull, t])

  useEffect(() => {
    if (historyError) {
      showToast(t('toast.historyFailed', { error: historyError }), 'error', 9000)
    }
  }, [historyError, t])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const projects = useProjects.getState()
  const editor = useEditor.getState()

  const renameProject = (draft: string) => {
    setRenamingProject(false)
    if (!currentId) return
    void projects.rename(currentId, draft).then((ok) => {
      if (ok) showToast(t('toast.renamed', { name: draft.trim() }))
      else showToast(t('toast.renameRejected'), 'error')
    })
  }

  const exportProject = () => {
    if (!current) return
    void exportProjectJson(current)
  }

  const exportMarkdown = () => {
    if (!current) return
    void exportMarkdownFile(current)
  }

  const exportOpml = () => {
    if (!current) return
    void exportOpmlFile(current)
  }

  const exportFreemind = () => {
    if (!current) return
    void exportFreemindFile(current)
  }

  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch (err) {
      showToast(
        t('common.failed', { label, error: err instanceof Error ? err.message : String(err) }),
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  const exportImage = (format: 'png' | 'svg') =>
    void run(format.toUpperCase(), async () => {
      if (!current) return
      await exportImageFile(format, preset, current)
    })

  const exportHtml = (zip: boolean) =>
    void run(t('export.htmlLabel'), async () => {
      if (!current) return
      await exportHtmlFile(current, preset, zip)
    })

  const importClicked = async () => {
    const file = await pickFile(IMPORT_ACCEPT)
    if (file) await importAndAnnounce(file)
  }

  const saveSnapshot = () => void askSnapshotName()

  const saveAs = () => void askSaveAs()

  // The "with images" ZIPs (#149) are offered when the project has pictures.
  const mapImages = treeHasImage(current?.map)
  const brainstormImages = treeHasImage(current?.brainstorm)
  const exportItems: ToolbarMenuItem[] = [
    { label: t('export.json'), onSelect: exportProject },
    ...(current && (mapImages || brainstormImages)
      ? [{ label: t('export.jsonZip'), onSelect: () => void exportProjectZip(current) }]
      : []),
    // The outline formats are lossy: they carry titles and notes only (#52).
    { label: t('export.markdown'), onSelect: exportMarkdown },
    ...(current && brainstormImages
      ? [{ label: t('export.markdownZip'), onSelect: () => void exportMarkdownZip(current) }]
      : []),
    { label: t('export.opml'), onSelect: exportOpml },
    { label: t('export.freemind'), onSelect: exportFreemind },
    { label: t('export.png'), onSelect: () => exportImage('png'), disabled: view !== 'map' },
    { label: t('export.svg'), onSelect: () => exportImage('svg'), disabled: view !== 'map' },
    { label: t('export.html'), onSelect: () => exportHtml(false) },
    { label: t('export.htmlZip'), onSelect: () => exportHtml(true) },
    {
      label: t('export.print'),
      onSelect: () => current && void printProjectFile(current, preset, view),
      disabled: !current,
      separatorBefore: true,
    },
    { label: t('export.ai'), onSelect: () => setAiDialogOpen(true), separatorBefore: true },
  ]

  // Project ▾ (#76, decision I-D1): everything about the project as a whole.
  const projectItems: ToolbarMenuItem[] = [
    { label: t('menu.newProject'), onSelect: () => void projects.createProject() },
    {
      label: t('menu.open'),
      // The palette already lists every project as "Open “…”", with search.
      onSelect: () => useUi.getState().setPaletteOpen(true, t('palette.openPrefix')),
    },
    {
      label: t('menu.save'),
      // Save also writes to the sync folder at once (V6).
      onSelect: () => void projects.saveCurrent().then(() => requestSync('now')),
      separatorBefore: true,
    },
    { label: t('menu.saveAs'), onSelect: saveAs, disabled: !current },
    { label: t('menu.saveSnapshot'), onSelect: saveSnapshot, disabled: !current },
    {
      label: t('menu.snapshots', { count: snapshots.length }),
      onSelect: () => useUi.getState().setSnapshotsOpen(true),
      disabled: !current,
    },
    {
      label: t('sync.menu'),
      onSelect: () => openSyncDialog(),
    },
    {
      label: t('github.menu'),
      onSelect: () => useUi.getState().setGithubOpen(true),
      disabled: !current,
    },
    {
      label: t('menu.duplicate'),
      onSelect: () => currentId && void projects.duplicate(currentId),
      disabled: !currentId,
      separatorBefore: true,
    },
    {
      label: t('menu.moveToTrash'),
      onSelect: () => setDeleteOpen(true),
      disabled: !currentId,
      danger: true,
    },
  ]

  return (
    <header className={`toolbar${moreOpen ? ' toolbar-more-open' : ''}`}>
      <div className="toolbar-row toolbar-row-main">
        <span className="toolbar-brand">{t('toolbar.brand')}</span>
        <button
          type="button"
          className="toolbar-home"
          title={t('toolbar.homeTitle')}
          aria-label={t('toolbar.home')}
          onClick={() => void projects.goHome()}
        >
          <ToolbarLabel icon="⌂" text={t('toolbar.home')} />
        </button>
        {renamingProject && current ? (
          <RenameInput
            className="toolbar-project-name toolbar-project-name-input"
            initial={current.name}
            onCommit={renameProject}
            onCancel={() => setRenamingProject(false)}
          />
        ) : (
          <button
            type="button"
            className="toolbar-project-name toolbar-project-name-button"
            title={t('toolbar.renameTitle')}
            disabled={!current}
            onClick={() => setRenamingProject(true)}
            onKeyDown={(e) => {
              if (e.key === 'F2') {
                e.preventDefault()
                setRenamingProject(true)
              }
            }}
          >
            {current?.name}
          </button>
        )}
        {current && (
          <span
            className={`status-badge save-status save-status-${saveStatus}`}
            role="status"
            aria-live="polite"
            data-testid="save-status"
          >
            {saveStatusLabel(saveStatus)}
          </span>
        )}
        {current && <SyncBadge />}
        <span
          className={`status-badge connection-status${isOnline ? '' : ' connection-status-offline'}`}
          role="status"
          aria-live="polite"
          data-testid="connection-status"
        >
          {connectionLabel(isOnline)}
        </span>
        <span className="toolbar-search toolbar-collapsible">
          <StudioSearch key={`${currentId ?? ''}:${view}`} onRevealBox={() => setMoreOpen(true)} />
        </span>
        <span className="toolbar-spacer" />
        <button
          type="button"
          className="toolbar-present"
          aria-label={t('present.start')}
          title={t('present.startTitle')}
          disabled={!current}
          data-testid="present-button"
          onClick={() => startPresentation()}
        >
          <ToolbarLabel icon="▶" text={t('present.start')} />
        </button>
        <button
          type="button"
          aria-label={t('toolbar.undo')}
          title={t('toolbar.undoTitle')}
          disabled={pastCount === 0}
          onClick={() => editor.undo()}
        >
          <ToolbarLabel icon="↶" text={t('toolbar.undo')} />
        </button>
        <button
          type="button"
          aria-label={t('toolbar.redo')}
          title={t('toolbar.redoTitle')}
          disabled={futureCount === 0}
          onClick={() => editor.redo()}
        >
          <ToolbarLabel icon="↷" text={t('toolbar.redo')} />
        </button>
        <button
          type="button"
          className="toolbar-more"
          aria-label={moreOpen ? t('toolbar.fewerActions') : t('toolbar.moreActions')}
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen((open) => !open)}
        >
          ⋯
        </button>
      </div>
      <div className="toolbar-row toolbar-tabs">
        <div className="toolbar-views">
          <nav
            className="tabs"
            role="tablist"
            aria-label={t('toolbar.section')}
            onKeyDown={onTablistKeyDown}
          >
            {tabs.map((tab, i) => {
              const selected = view === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`tab-${tab.id}-toggle`}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  className={`tab${selected ? ' tab-active' : ''}`}
                  role="tab"
                  aria-selected={selected}
                  aria-controls="tab-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => useEditor.getState().setView(tab.id)}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
          <button
            type="button"
            id="split-view-toggle"
            className={`tab${view === 'split' ? ' tab-active' : ''}`}
            aria-pressed={view === 'split'}
            aria-controls="tab-panel"
            onClick={() => useEditor.getState().setView('split')}
          >
            {t('view.split')}
          </button>
          <button
            type="button"
            className={`tab details-toggle${detailsShown ? ' tab-active' : ''}`}
            aria-pressed={detailsShown}
            title={t('toolbar.detailsTitle')}
            data-testid="details-toggle"
            onClick={toggleDetailsPanel}
          >
            {t('toolbar.details')}
          </button>
          <button
            type="button"
            className={`tab tags-toggle${tagPanelOpen ? ' tab-active' : ''}`}
            aria-expanded={tagPanelOpen}
            title={t('toolbar.tagsTitle')}
            disabled={!current}
            data-testid="tags-toggle"
            onClick={() => useUi.getState().setTagPanelOpen(!tagPanelOpen)}
          >
            {t('toolbar.tags')}
          </button>
          {tagFilterOn ? <TagFilterChipHost view={filterView} /> : null}
        </div>
        <span className="toolbar-spacer" />
        <div className="toolbar-io toolbar-collapsible" id={moreId}>
          <ToolbarMenu
            label={t('toolbar.projectMenu')}
            items={projectItems}
            testId="project-menu"
          />
          <ToolbarMenu
            label={t('toolbar.exportMenu')}
            items={exportItems}
            disabled={!current || busy}
            testId="export-menu"
          />
          <button type="button" disabled={!current} onClick={() => setPresetsOpen(true)}>
            {t('toolbar.presets')}
          </button>
          <button type="button" onClick={() => void importClicked()}>
            {t('toolbar.import')}
          </button>
        </div>
      </div>
      {current ? <TagFilterHost view={filterView} /> : null}
      {aiDialogOpen && current && (
        <LazyExportForAiDialog project={current} onClose={() => setAiDialogOpen(false)} />
      )}
      {presetsOpen && <LazyPresetsDialog onClose={() => setPresetsOpen(false)} />}
      {githubOpen && current && (
        <LazyGitHubDialog onClose={() => useUi.getState().setGithubOpen(false)} />
      )}
      {snapshotsOpen && current && (
        <LazySnapshotsDialog onClose={() => useUi.getState().setSnapshotsOpen(false)} />
      )}
      {deleteOpen && current && currentId && (
        <ConfirmDialog
          title={t('confirm.trashProjectTitle')}
          message={t('confirm.trashProjectMessage', { name: current.name })}
          confirmLabel={t('confirm.trashProjectAccept')}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => {
            const id = currentId
            setDeleteOpen(false)
            void projects.remove(id)
          }}
        />
      )}
    </header>
  )
}

/** Text on wide screens, a compact symbol on narrow ones (#76); the button's aria-label names it. */
function ToolbarLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <>
      <span className="toolbar-label-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="toolbar-label-text" aria-hidden="true">
        {text}
      </span>
    </>
  )
}
