import { create } from 'zustand'
import { getDetailsPanel, setDetailsPanel, type DetailsPanelSetting } from './session'
import type { Section } from './editor'

/**
 * Cross-component UI flags.
 *
 * These live outside `editor` (which owns view/selection/history) because the
 * command palette needs to open dialogs that are rendered by the toolbar. A
 * global store keeps the palette mountable at the App root without threading
 * props or duplicating the dialogs.
 */
export interface MarkerPickerTarget {
  section: Section
  id: string
  kind: 'color' | 'icon'
}

export interface UiState {
  paletteOpen: boolean
  /** Text the palette opens with (e.g. "Open " from Project ▾ → Open…). */
  paletteQuery: string
  shortcutsOpen: boolean
  /** Map node the "Link to…" picker links from (#90); null when closed. */
  linkPickFrom: string | null
  presetsOpen: boolean
  /** The snapshots dialog (#98). */
  snapshotsOpen: boolean
  /** The GitHub milestones dialog (#112b). */
  githubOpen: boolean
  aiDialogOpen: boolean
  /** The branch "Export this branch…" exports (#146); null when closed. */
  branchExport: { section: Section; id: string } | null
  /** The colour or emoji marker picker for one node (#148b); null when closed. */
  markerPicker: MarkerPickerTarget | null
  /** "Tags…" for one node, or "Add tag to selection" for several (#150); null when closed. */
  tagEditor: { section: Section; ids: string[] } | null
  /** The toolbar's tag filter panel (#150). */
  tagPanelOpen: boolean
  /** The image lightbox for one node (#149); null when closed. */
  imageViewer: { section: Section; id: string } | null
  renamingProject: boolean
  deleteOpen: boolean
  /**
   * Presentation mode (#152): null when not presenting; `from` is the node it
   * starts at ("Present from here"), null for the central topic.
   */
  presenting: { from: string | null } | null
  /**
   * The details panel's per-device setting (#144). Not transient: it survives
   * project switches and reloads (it is kept in localStorage).
   */
  detailsPanel: DetailsPanelSetting
  setPaletteOpen: (open: boolean, query?: string) => void
  setShortcutsOpen: (open: boolean) => void
  setLinkPickFrom: (id: string | null) => void
  setPresetsOpen: (open: boolean) => void
  setSnapshotsOpen: (open: boolean) => void
  setGithubOpen: (open: boolean) => void
  setAiDialogOpen: (open: boolean) => void
  setBranchExport: (branch: { section: Section; id: string } | null) => void
  setMarkerPicker: (target: MarkerPickerTarget | null) => void
  setTagEditor: (target: { section: Section; ids: string[] } | null) => void
  setTagPanelOpen: (open: boolean) => void
  setImageViewer: (target: { section: Section; id: string } | null) => void
  setRenamingProject: (open: boolean) => void
  setDeleteOpen: (open: boolean) => void
  setPresenting: (presenting: { from: string | null } | null) => void
  /** Show or hide the details panel and remember it on this device (#144). */
  setDetailsPanel: (setting: DetailsPanelSetting) => void
  closeAll: () => void
  /**
   * Clears everything the toolbar owns. Does NOT touch `paletteOpen`, which is
   * App-root state and legitimately survives a project switch.
   *
   * Load-bearing: these flags used to be toolbar-local `useState`, so they were
   * dropped whenever the toolbar remounted (project switch, back to the home
   * screen). As global state they would otherwise persist — and a stuck
   * `renamingProject` leaves an autofocused <input> in the toolbar, which every
   * document-level shortcut handler bails out on. That silently kills F2 rename
   * and Delete across the whole app while leaving click-driven editing (the
   * outline's click-to-rename) working, which reads as "rename broke".
   */
  resetTransient: () => void
}

export const useUi = create<UiState>()((set) => ({
  paletteOpen: false,
  paletteQuery: '',
  shortcutsOpen: false,
  linkPickFrom: null,
  presetsOpen: false,
  snapshotsOpen: false,
  githubOpen: false,
  aiDialogOpen: false,
  branchExport: null,
  markerPicker: null,
  tagEditor: null,
  tagPanelOpen: false,
  imageViewer: null,
  renamingProject: false,
  deleteOpen: false,
  presenting: null,
  detailsPanel: getDetailsPanel(),
  setPaletteOpen: (paletteOpen, paletteQuery = '') => set({ paletteOpen, paletteQuery }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setLinkPickFrom: (linkPickFrom) => set({ linkPickFrom }),
  setPresetsOpen: (presetsOpen) => set({ presetsOpen }),
  setSnapshotsOpen: (snapshotsOpen) => set({ snapshotsOpen }),
  setGithubOpen: (githubOpen) => set({ githubOpen }),
  setAiDialogOpen: (aiDialogOpen) => set({ aiDialogOpen }),
  setBranchExport: (branchExport) => set({ branchExport }),
  setMarkerPicker: (markerPicker) => set({ markerPicker }),
  setTagEditor: (tagEditor) => set({ tagEditor }),
  setTagPanelOpen: (tagPanelOpen) => set({ tagPanelOpen }),
  setImageViewer: (imageViewer) => set({ imageViewer }),
  setRenamingProject: (renamingProject) => set({ renamingProject }),
  setDeleteOpen: (deleteOpen) => set({ deleteOpen }),
  setPresenting: (presenting) => set({ presenting }),
  setDetailsPanel: (detailsPanel) => {
    setDetailsPanel(detailsPanel)
    set({ detailsPanel })
  },
  closeAll: () =>
    set({
      paletteOpen: false,
      paletteQuery: '',
      shortcutsOpen: false,
      linkPickFrom: null,
      presetsOpen: false,
      snapshotsOpen: false,
      githubOpen: false,
      aiDialogOpen: false,
      branchExport: null,
      markerPicker: null,
      tagEditor: null,
      tagPanelOpen: false,
      imageViewer: null,
      renamingProject: false,
      deleteOpen: false,
      presenting: null,
    }),
  resetTransient: () =>
    set({
      presetsOpen: false,
      snapshotsOpen: false,
      githubOpen: false,
      aiDialogOpen: false,
      branchExport: null,
      markerPicker: null,
      tagEditor: null,
      tagPanelOpen: false,
      imageViewer: null,
      renamingProject: false,
      deleteOpen: false,
      linkPickFrom: null,
      presenting: null,
    }),
}))
