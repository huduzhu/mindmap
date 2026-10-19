import { useEffect, useRef } from 'react'
import { MindMapCanvas } from './components/MindMapCanvas'
import { NodeDetailsDialog } from './components/NodeDetailsDialog'
import { StartScreen } from './components/StartScreen'
import { Announcer } from './components/Announcer'
import {
  BranchExportHost,
  MarkerPickerHost,
  TagDialogHost,
  ImageLightboxHost,
  ChoiceHost,
  CommandPaletteHost,
  PresentationHost,
  LazyBrainstormOutliner,
  LazyOutlineView,
  LinkPickerHost,
  PromptHost,
  ShortcutsHost,
  SyncHost,
} from './components/lazyDialogs'
import { startSyncIfLinked } from './sync/store'
import { ToastHost } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { useNodeClipboard } from './components/clipboardActions'
import { printProjectFile } from './components/exportActions'
import { Toolbar } from './components/Toolbar'
import { importAndAnnounce } from './components/importFile'
import { isTextEntry, toggleDetailsPanel } from './components/detailsPanel'
import { handlePresentKey } from './components/presentActions'
import { isImageFile, loadImages } from './assets/intake'
import { showToast } from './components/toastStore'
import { useResolvedPreset } from './hooks/usePreset'
import { applyPresetTheme } from './hooks/useTheme'
import { BUILT_IN_PRESETS } from './io/seed'
import { systemPresetName, useSystemDark } from './theme/system'
import { useLocale, useT } from './i18n'
import { useEditor } from './store/editor'
import { useProjects } from './store/projects'
import { useUi } from './store/ui'
import './App.css'
import './present/present.css'

function ProjectView({ projectId }: { projectId: string }) {
  const t = useT()
  useNodeClipboard() // Ctrl/Cmd+C, X, V on nodes (#101)
  const project = useProjects((s) => s.current)
  const preset = useResolvedPreset(project?.preset ?? 'default')
  const view = useEditor((s) => s.view)

  useEffect(() => {
    applyPresetTheme(preset)
  }, [preset])

  // Ctrl/Cmd+P prints the map (or the outline) rather than the app screen (#106).
  const presetRef = useRef(preset)
  useEffect(() => {
    presetRef.current = preset
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'p') return
      const current = useProjects.getState().current
      if (!current) return
      event.preventDefault()
      void printProjectFile(current, presetRef.current, useEditor.getState().view)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // F5 presents the map (#152) instead of reloading the page.
  useEffect(() => {
    document.addEventListener('keydown', handlePresentKey)
    return () => document.removeEventListener('keydown', handlePresentKey)
  }, [])

  // Ctrl/Cmd+I shows or hides the details panel (#144). Not inside text
  // fields (it is italics in some editors) or dialogs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'i') return
      const target = event.target as HTMLElement | null
      if (isTextEntry(target) || target?.closest?.('[role="dialog"], [role="menu"]')) return
      event.preventDefault()
      if (!event.repeat) toggleDetailsPanel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const editor = useEditor.getState()
    editor.resetTransient()
    const current = useProjects.getState().current
    const section = editor.view === 'brainstorm' ? 'brainstorm' : 'map'
    const tree = current?.[section]
    if (tree) editor.select(tree.id)
  }, [projectId])

  if (!project) return null
  return (
    <>
      <Toolbar />
      <div
        className={`project-body${view === 'split' ? ' project-body-split' : ''}`}
        id="tab-panel"
        role="tabpanel"
        aria-labelledby={view === 'split' ? 'split-view-toggle' : `tab-${view}-toggle`}
      >
        {view === 'split' ? (
          <div className="split-view" data-testid="split-view">
            <section
              className="split-pane"
              aria-label={t('app.brainstormPane')}
              data-testid="split-brainstorm-pane"
            >
              <LazyBrainstormOutliner />
            </section>
            <section
              className="split-pane"
              aria-label={t('app.outlinePane')}
              data-testid="split-outline-pane"
            >
              <LazyOutlineView />
            </section>
          </div>
        ) : view === 'map' ? (
          <MindMapCanvas />
        ) : view === 'brainstorm' ? (
          <LazyBrainstormOutliner />
        ) : (
          <LazyOutlineView />
        )}
        <NodeDetailsDialog />
      </div>
    </>
  )
}

function App() {
  const t = useT()
  const loaded = useProjects((s) => s.loaded)
  const currentId = useProjects((s) => s.currentId)
  const systemDark = useSystemDark()
  const locale = useLocale((state) => state.locale)

  // Screen readers and fonts pick the right language (#89).
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // The start and loading screens have no project preset: follow the device's
  // light/dark setting (#86). A project applies its own preset in ProjectView.
  useEffect(() => {
    if (currentId) return
    const name = systemPresetName(systemDark)
    applyPresetTheme(BUILT_IN_PRESETS.find((preset) => preset.name === name) ?? BUILT_IN_PRESETS[0])
  }, [currentId, systemDark])
  const dbNotice = useProjects((s) => s.dbNotice)

  useEffect(() => {
    void useProjects.getState().init()
  }, [])

  // Resume folder sync once the library is loaded (#107).
  useEffect(() => {
    if (loaded) void startSyncIfLinked().catch(() => undefined)
  }, [loaded])

  useEffect(() => {
    if (loaded && dbNotice) showToast(dbNotice, 'error', 15000)
  }, [loaded, dbNotice])

  const openError = useProjects((s) => s.openError)
  const openNotes = useProjects((s) => s.openNotes)
  useEffect(() => {
    if (openError)
      showToast(
        `“${openError.name}” could not be opened: its stored data is damaged.`,
        'error',
        9000,
      )
  }, [openError])
  const syncNotice = useProjects((s) => s.syncNotice)
  useEffect(() => {
    if (!syncNotice) return
    showToast(syncNotice, 'info', 12000)
    useProjects.setState({ syncNotice: null })
  }, [syncNotice])
  useEffect(() => {
    if (openNotes.length > 0)
      showToast(t('toast.openedWithRepairs', { notes: openNotes.join(' ') }), 'info', 9000)
  }, [openNotes, t])

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      e.preventDefault()
      // A picture dropped into an open project goes on the node under the
      // pointer, or on a new node (#149); other files are imported as before.
      if (isImageFile(file) && useProjects.getState().current) {
        const element = e.target instanceof Element ? e.target : null
        void loadImages().then((images) => images.dropImage(file, element))
      } else void importAndAnnounce(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  useEffect(() => {
    // Document-level so it works from the start screen, the canvas, or inside a
    // rename input. Real interactive elements keep their own keys, but Ctrl/Cmd+K
    // is not one any of them claim.
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k' || e.altKey) return
      e.preventDefault()
      const ui = useUi.getState()
      ui.setPaletteOpen(!ui.paletteOpen)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    // Transient dialog flags must not follow the user across projects. A stuck
    // `renamingProject` leaves an autofocused <input> in the toolbar, and every
    // document-level shortcut handler bails on inputs — which silently kills F2
    // rename and Delete app-wide. See resetTransient in src/store/ui.ts.
    useUi.getState().resetTransient()
  }, [currentId])

  useEffect(() => {
    // visibilitychange→hidden is load-bearing: the 800ms debounce is otherwise only flushed by
    // in-app navigation and an explicit Save, so backgrounding longer than the debounce can drop
    // edits if the process is killed. pagehide catches the older-Safari/PWA cases.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void useProjects.getState().saveCurrent()
      }
    }
    const onPageHide = () => {
      void useProjects.getState().saveCurrent()
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Best-effort only: installed (standalone) PWAs and some mobile browsers may close
      // without showing this prompt, which is why the saves above on visibilitychange and
      // pagehide carry the real weight.
      if (useProjects.getState().hasUnsavedChanges()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  if (!loaded) {
    return (
      <div className="loading" role="status" aria-live="polite">
        {dbNotice ?? t('app.loading')}
      </div>
    )
  }
  if (!currentId) {
    return (
      <>
        <StartScreen />
        <ToastHost />
        <UpdateBanner />
        <CommandPaletteHost />
        <PromptHost />
        <ShortcutsHost />
        <ChoiceHost />
        <SyncHost />
        <LinkPickerHost />
        <Announcer />
      </>
    )
  }
  return (
    <>
      <div className="app" key={currentId}>
        <ProjectView projectId={currentId} />
      </div>
      <ToastHost />
      <UpdateBanner />
      <CommandPaletteHost />
      <PromptHost />
      <ShortcutsHost />
      <ChoiceHost />
      <SyncHost />
      <LinkPickerHost />
      <BranchExportHost />
      <MarkerPickerHost />
      <TagDialogHost />
      <ImageLightboxHost />
      <PresentationHost />
      <Announcer />
    </>
  )
}

export default App
