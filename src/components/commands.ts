import { useResolvedPreset } from '../hooks/usePreset'
import {
  exportFreemindFile,
  exportHtmlFile,
  exportImageFile,
  exportMarkdownFile,
  exportOpmlFile,
  exportProjectJson,
  reportExport,
  printProjectFile,
} from './exportActions'
import { pickFile } from '../io/files'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { openSyncDialog } from '../sync/store'
import { copyFromMenu, pasteFromMenu } from './clipboardActions'
import { LOCALES, setLocale, t, tn, useLocale } from '../i18n'
import '../i18n/en/commands'
import { foldView } from './foldActions'
import { activeFocusView, currentViewRoot, focusBackTo, focusOn, focusUp } from './focusActions'
import { focusSection } from '../store/editor'
import { findNode, setMark } from '../store/treeOps'
import { copyBrainstormToMap } from './brainstormToMap'
import { openGuide } from './guide'
import { backUpLibrary, IMPORT_ACCEPT, importAndAnnounce } from './importFile'
import { askSaveAs, askSnapshotName } from './projectPrompts'
import { toggleDetailsPanel } from './detailsPanel'
import { toggleTaskDone } from './taskActions'
import { editLinkLabel } from './linkActions'
import { linkBetween } from '../store/links'
import { startPresentation } from './presentActions'
import { loadImages } from '../assets/intake'

export interface Command {
  id: string
  title: string
  group: string
  /** Extra terms the search should match on but that would clutter the title. */
  keywords?: string
  disabled?: boolean
  /** Keyboard shortcut shown on the right of the row (#81). */
  shortcut?: string
  run: () => void
}

function isSubsequence(haystack: string, needle: string): boolean {
  if (!needle) return true
  let i = 0
  for (const char of haystack) {
    if (char === needle[i]) i += 1
    if (i === needle.length) return true
  }
  return false
}

/**
 * Higher is better; 0 means "no match, drop it". An empty query scores
 * everything at 1 so the caller keeps the registry's own ordering.
 */
export function commandScore(command: Command, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const title = command.title.toLowerCase()
  const keywords = (command.keywords ?? '').toLowerCase()
  const group = command.group.toLowerCase()
  if (title === q) return 1000
  if (title.startsWith(q)) return 800
  if (title.includes(q)) return 600
  if (keywords.includes(q)) return 400
  if (isSubsequence(title, q)) return 300
  if (group.startsWith(q)) return 200
  if (group.includes(q)) return 150
  if (isSubsequence(`${title} ${keywords}`, q)) return 100
  return 0
}

export function filterCommands(commands: Command[], query: string): Command[] {
  return commands
    .map((command, index) => ({ command, index, score: commandScore(command, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command)
}

/**
 * The palette's registry. Rebuilt on every render on purpose — it is cheap,
 * and it keeps the `run` closures bound to the latest store state instead of
 * a stale snapshot captured by a memo.
 */
export function useCommands(): Command[] {
  const records = useProjects((s) => s.records)
  const locale = useLocale((state) => state.locale)
  const currentId = useProjects((s) => s.currentId)
  const current = useProjects((s) => s.current)
  const view = useEditor((s) => s.view)
  const pastCount = useEditor((s) => s.past.length)
  const futureCount = useEditor((s) => s.future.length)
  const selection = useEditor((s) => s.selection)
  const selectionSet = useEditor((s) => s.selectionSet)
  const focus = useEditor((s) => s.focus)
  const preset = useResolvedPreset(current?.preset ?? 'default')
  const setPresetsOpen = useUi((s) => s.setPresetsOpen)
  const setAiDialogOpen = useUi((s) => s.setAiDialogOpen)
  const setRenamingProject = useUi((s) => s.setRenamingProject)
  const setDeleteOpen = useUi((s) => s.setDeleteOpen)
  const detailsShown = useUi((s) => s.detailsPanel) === 'shown'

  const projects = useProjects.getState()
  const editor = useEditor.getState()
  const commands: Command[] = []

  commands.push(
    {
      id: 'project.new',
      group: t('group.project'),
      title: t('cmd.newProject'),
      keywords: 'create add blank',
      run: () => void projects.createProject(),
    },
    {
      id: 'project.home',
      group: t('group.project'),
      title: t('cmd.home'),
      keywords: 'home close projects list',
      disabled: !current,
      run: () => void projects.goHome(),
    },
    {
      id: 'project.save',
      group: t('group.project'),
      title: t('cmd.save'),
      keywords: 'flush persist',
      disabled: !current,
      run: () => void projects.saveCurrent(),
    },
    {
      id: 'project.save-as',
      group: t('group.project'),
      title: t('cmd.saveAs'),
      keywords: 'fork copy duplicate under a new name',
      disabled: !current,
      run: () => void askSaveAs(),
    },
    {
      id: 'project.rename',
      group: t('group.project'),
      title: t('cmd.rename'),
      keywords: 'title name f2',
      disabled: !current,
      run: () => setRenamingProject(true),
    },
    {
      id: 'project.snapshot',
      group: t('group.project'),
      title: t('cmd.snapshot'),
      keywords: 'named checkpoint version',
      disabled: !current,
      run: () => void askSnapshotName(),
    },
    {
      id: 'edit.copy',
      group: t('group.edit'),
      title: t('clipboard.copy'),
      shortcut: 'Ctrl+C',
      keywords: 'copy nodes clipboard ctrl+c',
      disabled: !current,
      run: () => void copyFromMenu(),
    },
    {
      id: 'edit.cut',
      group: t('group.edit'),
      title: t('clipboard.cutAction'),
      shortcut: 'Ctrl+X',
      keywords: 'cut nodes clipboard ctrl+x',
      disabled: !current,
      run: () => void copyFromMenu(true),
    },
    {
      id: 'edit.paste',
      group: t('group.edit'),
      title: t('clipboard.paste'),
      shortcut: 'Ctrl+V',
      keywords: 'paste nodes clipboard ctrl+v children',
      disabled: !current,
      run: () => void pasteFromMenu('child'),
    },
    {
      id: 'edit.paste-sibling',
      group: t('group.edit'),
      title: t('clipboard.pasteSibling'),
      shortcut: 'Ctrl+Shift+V',
      keywords: 'paste nodes clipboard ctrl+shift+v siblings',
      disabled: !current,
      run: () => void pasteFromMenu('sibling'),
    },
    {
      id: 'project.sync',
      group: t('group.project'),
      title: t('sync.menu'),
      keywords: 'onedrive folder sync computers backup files 同步',
      run: () => openSyncDialog(),
    },
    {
      id: 'project.github',
      group: t('group.project'),
      title: t('github.menu'),
      keywords: 'github git commit milestone version backup tag',
      disabled: !current,
      run: () => useUi.getState().setGithubOpen(true),
    },
    {
      id: 'project.snapshots',
      group: t('group.project'),
      title: t('cmd.snapshots'),
      keywords: 'versions restore checkpoints history',
      disabled: !current,
      run: () => useUi.getState().setSnapshotsOpen(true),
    },
    {
      id: 'project.duplicate',
      group: t('group.project'),
      title: t('cmd.duplicate'),
      keywords: 'copy clone',
      disabled: !currentId,
      run: () => currentId && void projects.duplicate(currentId),
    },
    {
      id: 'project.delete',
      group: t('group.project'),
      title: t('cmd.trash'),
      keywords: 'delete remove bin',
      disabled: !current,
      run: () => setDeleteOpen(true),
    },
  )

  for (const record of records) {
    if (record.id === currentId) continue
    commands.push({
      id: `open.${record.id}`,
      group: t('group.open'),
      title: t('cmd.openProject', { name: record.project.name }),
      keywords: 'switch project load',
      run: () => void projects.loadProject(record.id),
    })
  }

  commands.push(
    {
      id: 'view.map',
      group: t('group.view'),
      title: t('cmd.viewMap'),
      keywords: 'canvas tab switch',
      disabled: view === 'map',
      run: () => editor.setView('map'),
    },
    {
      id: 'view.brainstorm',
      group: t('group.view'),
      title: t('cmd.viewBrainstorm'),
      keywords: 'outliner tab switch',
      disabled: view === 'brainstorm',
      run: () => editor.setView('brainstorm'),
    },
    {
      id: 'view.outline',
      group: t('group.view'),
      title: t('cmd.viewOutline'),
      keywords: 'tab switch indented',
      disabled: view === 'outline',
      run: () => editor.setView('outline'),
    },
    {
      id: 'view.split',
      group: t('group.view'),
      title: t('cmd.viewSplit'),
      keywords: 'side by side dual pane',
      disabled: view === 'split',
      run: () => editor.setView('split'),
    },
    {
      id: 'view.details',
      group: t('group.view'),
      title: detailsShown ? t('cmd.hideDetails') : t('cmd.showDetails'),
      keywords: 'details panel notes role side sidebar inspector toggle 详情 面板',
      shortcut: 'Ctrl+I',
      disabled: !current,
      run: () => toggleDetailsPanel(),
    },
  )

  // Focus on one branch (#146): the selected node in the active view.
  const focusView = activeFocusView()
  const focusedOn = focus[focusView]
  const shownRoot = current ? currentViewRoot(focusView) : undefined
  const canFocus = Boolean(
    selection && shownRoot && selection !== shownRoot.id && findNode(shownRoot, selection),
  )
  const sectionTree = current?.[focusSection(focusView)]
  const canExportBranch = Boolean(
    selection && sectionTree && selection !== sectionTree.id && findNode(sectionTree, selection),
  )
  commands.push(
    {
      id: 'focus.enter',
      group: t('group.view'),
      title: t('focus.enter'),
      keywords: 'zoom drill down branch subtree hoist',
      shortcut: 'Alt+→',
      disabled: !canFocus,
      run: () => selection && focusOn(focusView, selection),
    },
    {
      id: 'focus.up',
      group: t('group.view'),
      title: t('focus.up'),
      keywords: 'zoom out focus parent branch',
      shortcut: 'Alt+←',
      disabled: !focusedOn,
      run: () => void focusUp(focusView),
    },
    {
      id: 'focus.leave',
      group: t('group.view'),
      title: t('focus.leave'),
      keywords: 'zoom out focus whole map tree',
      disabled: !focusedOn,
      run: () => focusBackTo(focusView, null),
    },
    {
      id: 'export.branch',
      group: t('group.export'),
      title: t('branch.export'),
      keywords: 'download subtree branch markdown opml png svg html json',
      disabled: !canExportBranch,
      run: () =>
        selection &&
        useUi.getState().setBranchExport({ section: focusSection(focusView), id: selection }),
    },
  )

  // Presentation mode (#152): the map, or its focused branch, from the start
  // or from the selected map node.
  const presentRoot = current
    ? currentViewRoot(focusSection(focusView) === 'map' ? focusView : 'map')
    : undefined
  const canPresentHere = Boolean(
    selection && presentRoot && editor.activeSection === 'map' && findNode(presentRoot, selection),
  )
  commands.push(
    {
      id: 'present.start',
      group: t('group.view'),
      title: t('present.start'),
      keywords: 'presentation slideshow walkthrough full screen show 演示',
      shortcut: 'F5',
      disabled: !current,
      run: () => void startPresentation(),
    },
    {
      id: 'present.from-here',
      group: t('group.view'),
      title: t('present.fromHere'),
      keywords: 'presentation slideshow walkthrough selected node 演示',
      shortcut: 'Shift+F5',
      disabled: !canPresentHere,
      run: () => void startPresentation(true),
    },
  )

  // Folding (#145): the active view's tree, as one undo step each.
  commands.push(
    {
      id: 'fold.expand-all',
      group: t('group.view'),
      title: t('fold.expandAll'),
      keywords: 'unfold open show everything branches',
      shortcut: 'Alt+.',
      disabled: !current,
      run: () => foldView({ kind: 'expand' }, undefined, focusedOn ?? undefined),
    },
    {
      id: 'fold.collapse-all',
      group: t('group.view'),
      title: t('fold.collapseAll'),
      keywords: 'fold close hide branches overview',
      shortcut: 'Alt+,',
      disabled: !current,
      run: () => foldView({ kind: 'collapse' }, undefined, focusedOn ?? undefined),
    },
    ...[1, 2, 3].map((levels) => ({
      id: `fold.levels-${levels}`,
      group: t('group.view'),
      title: tn('fold.showLevels', levels),
      keywords: 'fold unfold depth levels outline',
      shortcut: `Alt+${levels}`,
      disabled: !current,
      run: () => foldView({ kind: 'levels', levels }, undefined, focusedOn ?? undefined),
    })),
  )

  // Task done state (#148a): the selected node in the active view.
  const taskSection = focusSection(focusView)
  const canToggleDone = Boolean(
    selection && sectionTree && selection !== sectionTree.id && findNode(sectionTree, selection),
  )
  const selectedNode = canToggleDone ? findNode(sectionTree!, selection!)?.node : undefined
  commands.push({
    id: 'edit.toggle-done',
    group: t('group.edit'),
    title:
      selectedNode && selectedNode.role !== 'task' ? t('canvas.makeTask') : t('cmd.toggleDone'),
    keywords: 'task todo check done complete finished checkbox',
    shortcut: 'Ctrl+Enter',
    disabled: !canToggleDone,
    run: () => selection && toggleTaskDone(taskSection, selection),
  })

  // Colour and emoji markers (#148b), any node of the active view.
  const canMark = Boolean(selection && sectionTree && findNode(sectionTree, selection))
  const markedNode = canMark ? findNode(sectionTree!, selection!)?.node : undefined
  const openMarker = (kind: 'color' | 'icon') =>
    selection && useUi.getState().setMarkerPicker({ section: taskSection, id: selection, kind })
  commands.push(
    {
      id: 'edit.color',
      group: t('group.edit'),
      title: t('cmd.setColor'),
      keywords: 'colour color highlight label palette',
      disabled: !canMark,
      run: () => openMarker('color'),
    },
    {
      id: 'edit.marker',
      group: t('group.edit'),
      title: t('cmd.setMarker'),
      keywords: 'emoji icon marker sticker symbol flag',
      disabled: !canMark,
      run: () => openMarker('icon'),
    },
    {
      id: 'edit.clear-marks',
      group: t('group.edit'),
      title: t('cmd.clearMarks'),
      keywords: 'clear delete badge tint hue',
      disabled: !markedNode || (markedNode.color === undefined && markedNode.icon === undefined),
      run: () =>
        selection &&
        editor.applyTree(taskSection, (tree) =>
          setMark(setMark(tree, selection, 'color', undefined), selection, 'icon', undefined),
        ),
    },
  )

  // Node tags (#150): the selected node, or every selected node of the view.
  const tagIds = [...new Set([...(selection ? [selection] : []), ...selectionSet])].filter(
    (id) => sectionTree && findNode(sectionTree, id),
  )
  const tagFilterOn = Boolean(useEditor.getState().tagFilter[focusView]?.tags.length)
  commands.push(
    {
      id: 'edit.tags',
      group: t('group.edit'),
      title: t('cmd.editTags'),
      keywords: 'tag tags hashtag label category #',
      disabled: !canMark,
      run: () =>
        selection && useUi.getState().setTagEditor({ section: taskSection, ids: [selection] }),
    },
    {
      id: 'edit.add-tag',
      group: t('group.edit'),
      title: t('cmd.addTag'),
      keywords: 'tag tags hashtag label many selection multiple #',
      disabled: tagIds.length === 0,
      run: () => useUi.getState().setTagEditor({ section: taskSection, ids: tagIds }),
    },
    {
      id: 'view.tag-filter',
      group: t('group.view'),
      title: t('cmd.tagFilter'),
      keywords: 'tag tags filter highlight hide dim hashtag #',
      disabled: !current,
      run: () => useUi.getState().setTagPanelOpen(true),
    },
    {
      id: 'view.clear-tag-filter',
      group: t('group.view'),
      title: t('cmd.clearTagFilter'),
      keywords: 'tag tags filter clear reset show all',
      disabled: !tagFilterOn,
      run: () => editor.setTagFilter(focusView, null),
    },
  )

  // Images (#149): the selected node of the active view.
  const imageNode = canMark ? findNode(sectionTree!, selection!)?.node : undefined
  commands.push(
    {
      id: 'edit.add-image',
      group: t('group.edit'),
      title: imageNode?.image ? t('cmd.replaceImage') : t('cmd.addImage'),
      keywords: 'image picture photo screenshot insert attach file',
      disabled: !canMark,
      run: () =>
        selection &&
        void loadImages().then((m) => m.pickAndAttach({ section: taskSection, id: selection })),
    },
    {
      id: 'edit.view-image',
      group: t('group.edit'),
      title: t('cmd.viewImage'),
      keywords: 'image picture photo lightbox zoom show alt text',
      shortcut: 'Shift+Space',
      disabled: !imageNode?.image,
      run: () =>
        selection && useUi.getState().setImageViewer({ section: taskSection, id: selection }),
    },
    {
      id: 'edit.remove-image',
      group: t('group.edit'),
      title: t('cmd.removeImage'),
      keywords: 'image picture photo delete clear',
      disabled: !imageNode?.image,
      run: () => selection && void loadImages().then((m) => m.removeImage(taskSection, selection)),
    },
  )

  // Label the link between the two selected map nodes (#148c).
  const pair = [...selectionSet]
  const linkedPair =
    pair.length === 2 && linkBetween(current?.links, pair[0], pair[1]) ? pair : null
  commands.push({
    id: 'edit.link-label',
    group: t('group.edit'),
    title: t('cmd.labelLink'),
    keywords: 'cross link label name relation arrow',
    disabled: !linkedPair,
    run: () => linkedPair && void editLinkLabel(linkedPair[0], linkedPair[1]),
  })

  commands.push(
    {
      id: 'edit.undo',
      group: t('group.edit'),
      title: t('cmd.undo'),
      keywords: 'revert ctrl z',
      shortcut: 'Ctrl+Z',
      disabled: pastCount === 0,
      run: () => editor.undo(),
    },
    {
      id: 'edit.redo',
      group: t('group.edit'),
      title: t('cmd.redo'),
      keywords: 'repeat ctrl shift z y',
      shortcut: 'Ctrl+Y',
      disabled: futureCount === 0,
      run: () => editor.redo(),
    },
  )

  commands.push(
    {
      id: 'export.json',
      group: t('group.export'),
      title: t('cmd.exportJson'),
      keywords: 'download mindmap file backup',
      disabled: !current,
      run: () => current && void exportProjectJson(current),
    },
    {
      id: 'export.markdown',
      group: t('group.export'),
      title: t('cmd.exportMarkdown'),
      keywords: 'download md bullets',
      disabled: !current,
      run: () => current && void exportMarkdownFile(current),
    },
    {
      id: 'export.opml',
      group: t('group.export'),
      title: t('cmd.exportOpml'),
      keywords: 'download xml outline',
      disabled: !current,
      run: () => current && void exportOpmlFile(current),
    },
    {
      id: 'export.freemind',
      group: t('group.export'),
      title: t('cmd.exportFreemind'),
      keywords: 'download mm xml',
      disabled: !current,
      run: () => current && void exportFreemindFile(current),
    },
    {
      id: 'export.png',
      group: t('group.export'),
      title: t('cmd.exportPng'),
      keywords: 'download raster snapshot picture',
      disabled: !current || view !== 'map',
      run: () => current && reportExport(() => exportImageFile('png', preset, current)),
    },
    {
      id: 'export.svg',
      group: t('group.export'),
      title: t('cmd.exportSvg'),
      keywords: 'download vector snapshot',
      disabled: !current || view !== 'map',
      run: () => current && reportExport(() => exportImageFile('svg', preset, current)),
    },
    {
      id: 'export.html',
      group: t('group.export'),
      title: t('cmd.exportHtml'),
      keywords: 'download viewer share single file',
      disabled: !current,
      run: () => current && reportExport(() => exportHtmlFile(current, preset, false)),
    },
    {
      id: 'export.html-zip',
      group: t('group.export'),
      title: t('cmd.exportHtmlZip'),
      keywords: 'download viewer share archive',
      disabled: !current,
      run: () => current && reportExport(() => exportHtmlFile(current, preset, true)),
    },
    {
      id: 'export.print',
      group: t('group.export'),
      title: t('export.print'),
      keywords: 'print pdf paper page 打印',
      shortcut: 'Ctrl+P',
      disabled: !current,
      run: () => current && void printProjectFile(current, preset, view),
    },
    {
      id: 'export.ai',
      group: t('group.export'),
      title: t('cmd.exportAi'),
      keywords: 'packet llm expand convert improve',
      disabled: !current,
      run: () => setAiDialogOpen(true),
    },
  )

  commands.push({
    id: 'import.file',
    group: t('group.import'),
    title: t('cmd.import'),
    keywords: 'json md markdown zip open load restore backup',
    run: () => {
      void pickFile(IMPORT_ACCEPT).then((file) => {
        if (file) return importAndAnnounce(file)
      })
    },
  })

  commands.push({
    id: 'brainstorm.to-map',
    group: t('group.project'),
    title: t('cmd.toMap'),
    keywords: 'convert bullets branches outline generate build',
    disabled: !current || !(current.brainstorm.children?.length ?? 0),
    run: () => void copyBrainstormToMap(),
  })

  commands.push({
    id: 'help.guide',
    group: t('group.help'),
    title: t('cmd.guide'),
    keywords: 'help tutorial shortcuts keys learn example 入门 指南',
    run: () => void openGuide(),
  })

  for (const option of LOCALES) {
    commands.push({
      id: `language.${option.id}`,
      group: t('group.help'),
      title: t('language.switchTo', { language: option.name }),
      keywords: 'language locale chinese english 中文 语言 翻译',
      disabled: option.id === locale,
      run: () => void setLocale(option.id),
    })
  }

  commands.push({
    id: 'help.shortcuts',
    group: t('group.help'),
    title: t('cmd.shortcuts'),
    keywords: 'keys hotkeys help cheat sheet',
    run: () => useUi.getState().setShortcutsOpen(true),
  })

  commands.push({
    id: 'library.backup',
    group: t('group.import'),
    title: t('cmd.backup'),
    keywords: 'backup export zip library download everything save',
    run: () => void backUpLibrary(),
  })

  commands.push({
    id: 'presets.manage',
    group: t('group.appearance'),
    title: t('cmd.presets'),
    keywords: 'theme style palette colors font',
    disabled: !current,
    run: () => setPresetsOpen(true),
  })

  return commands
}
