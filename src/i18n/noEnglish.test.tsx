import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { putSetting } from '../io/db'
import { GITHUB_SETTINGS_KEY } from '../sync/github'
import { useSync } from '../sync/store'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { makeTree } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { parseMarkdown } from '../io/markdown'
import { sanitizeProject } from '../io/sanitize'
import { setLocale, tn } from './index'
import '../i18n/en/github'
import { showToast } from '../components/toastStore'

/**
 * Regression guard for #99: in Chinese mode no English word is left in the
 * main screens — visible text, and the labels screen readers and tooltips use.
 * User content here is Chinese, so any Latin word must come from the app.
 */
const ALLOWED = new Set([
  // Names, formats and keys that stay as they are.
  'Mind',
  'Map',
  'Studio',
  'JSON',
  'PNG',
  'SVG',
  'HTML',
  'ZIP',
  'OPML',
  'FreeMind',
  'GitHub', // product names stay as they are
  'OneDrive',
  'assets', // the sync folder's _assets folder, named as it is on disk (#149)
  'Mac', // "on a Mac, use ⌘ instead of Ctrl" in the shortcuts dialog
  'Contents', // the token permission, named as GitHub shows it
  'Markdown',
  'Ctrl',
  'Shift',
  'Tab',
  'Enter',
  'Esc',
  'Alt',
  'Del',
  'Delete',
  'Home', // key caps in the presentation shortcuts (#152)
  'End',
  'PgUp',
  'PgDn',
  'Backspace',
  'https', // the Markdown link example in the notes hint
  'json', // file extensions in the import hint
  'txt',
  'zip',
  'opml',
  'English', // each language is named in its own language
  // "Try the guide · 入门指南" is bilingual on purpose (decision H-D1).
  'Try',
  'the',
  'guide',
  // React Flow's attribution link ("React Flow attribution") is the library's own.
  'React',
  'Flow',
  'attribution',
])

/**
 * English words in the visible text and labels under `root`. Key caps (<kbd>)
 * are skipped unless `kbd` is set; the shortcuts dialog checks them too, so a
 * word like "Space" or "Tap" in a key cap is caught (#137).
 */
function englishWords(root: HTMLElement, { kbd = false } = {}): string[] {
  const found = new Set<string>()
  const check = (text: string | null) => {
    for (const word of text?.match(/[A-Za-z]{3,}/g) ?? []) {
      if (!ALLOWED.has(word)) found.add(word)
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement
    if (parent?.closest(kbd ? 'style, script' : 'style, script, kbd')) continue
    check(walker.currentNode.textContent)
  }
  for (const el of root.querySelectorAll('[aria-label], [title], [placeholder]')) {
    check(el.getAttribute('aria-label'))
    check(el.getAttribute('title'))
    check(el.getAttribute('placeholder'))
  }
  return [...found].sort()
}

describe('Chinese interface (#99)', () => {
  beforeEach(async () => {
    useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
    useEditor.getState().reset()
    await resetDatabase()
    await setLocale('zh-CN')
  })

  afterEach(async () => {
    await setLocale('en')
    useSync.setState({
      status: 'off',
      folderName: null,
      skipped: [],
      paused: null,
      images: null,
      dialogOpen: false,
    })
    useUi.setState({ githubOpen: false })
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })

  it('shows no English on the start, map, brainstorm, outline and snapshots screens', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    const start = englishWords(container)
    await act(async () => {
      await useProjects.getState().createProject('项目')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: makeTree('m', '中心', [
          makeTree('a', '想法', [makeTree('a1', '细节')], { role: 'task', notes: '备注' }),
          // Folded, so the fold controls and the "+N" count are checked too (#145).
          makeTree('b', '另一个', [makeTree('b1', '藏起来')], { collapsed: true }),
        ]),
        brainstorm: makeTree('br', '头脑风暴', [makeTree('i1', '点子')]),
      }))
    })

    const screens: Record<string, string[]> = { start }
    act(() => useEditor.getState().setView('map'))
    act(() => useEditor.getState().select('a'))
    screens.map = englishWords(container)

    // The details toggle and its hidden state (#144).
    const detailsToggle = screen.getByTestId('details-toggle')
    expect(detailsToggle).toHaveTextContent('详情')
    fireEvent.click(detailsToggle)
    expect(screen.queryByTestId('node-details')).toBeNull()
    screens.detailsHidden = englishWords(container)
    fireEvent.click(detailsToggle)

    act(() => useEditor.getState().setView('brainstorm'))
    screens.brainstorm = englishWords(container)

    act(() => useEditor.getState().setView('outline'))
    act(() => useEditor.getState().select('a'))
    screens.outline = englishWords(container)

    act(() => useEditor.getState().setView('split'))
    screens.split = englishWords(container)

    // A view focused on one branch: the breadcrumb bar (#146).
    act(() => useEditor.getState().setView('map'))
    act(() => useEditor.getState().setFocus('map', 'a'))
    await screen.findByTestId('focus-bar-map')
    screens.focused = englishWords(container)
    act(() => useUi.getState().setBranchExport({ section: 'map', id: 'a' }))
    await screen.findByTestId('branch-export-dialog')
    screens.branchExport = englishWords(container)
    act(() => useUi.getState().setBranchExport(null))
    act(() => useEditor.getState().setFocus('map', null))

    act(() => useUi.getState().setSnapshotsOpen(true))
    await screen.findByTestId('snapshots-dialog')
    screens.snapshots = englishWords(container)
    act(() => useUi.getState().setSnapshotsOpen(false))

    fireEvent.click(screen.getByRole('button', { name: '项目 ▾' }))
    screens.projectMenu = englishWords(container)

    expect(screens).toEqual({
      start: [],
      map: [],
      detailsHidden: [],
      brainstorm: [],
      outline: [],
      split: [],
      focused: [],
      branchExport: [],
      snapshots: [],
      projectMenu: [],
    })
  })

  it('shows no English in the shortcuts, a search with no hits, default names and dates (#137)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    await act(async () => {
      await useProjects.getState().createProject()
    })
    expect(useProjects.getState().current!.name).toBe('未命名项目')
    const screens: Record<string, string[]> = {}

    fireEvent.change(screen.getByTestId('studio-search'), { target: { value: '没有这个' } })
    expect(await screen.findByTestId('search-count')).toHaveTextContent('0 个匹配')
    screens.search = englishWords(container)

    // "3 of 12" while stepping through matches (#147).
    act(() => useEditor.getState().setView('map'))
    const rootTitle = useProjects.getState().current!.map.title
    fireEvent.change(screen.getByTestId('studio-search'), { target: { value: rootTitle } })
    expect(screen.getByTestId('search-count')).toHaveTextContent('第 1 个，共 1 个')
    screens.searchHits = englishWords(container)

    act(() => useUi.getState().setShortcutsOpen(true))
    await waitFor(() => expect(container.querySelector('.shortcuts-dialog')).not.toBeNull())
    screens.shortcuts = englishWords(container, { kbd: true })
    act(() => useUi.getState().setShortcutsOpen(false))

    // The start screen lists the project with its date in the app's language.
    await act(async () => {
      await useProjects.getState().goHome()
    })
    await screen.findByText('未命名项目')
    screens.startWithProject = englishWords(container)

    expect(screens).toEqual({
      search: [],
      searchHits: [],
      shortcuts: [],
      startWithProject: [],
    })
  })

  it('shows no English on tasks, markers and link labels (#148)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    await act(async () => {
      await useProjects.getState().createProject('项目')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: makeTree('m', '中心', [
          makeTree('a', '订货', [
            makeTree('a1', '瓷砖', [], { role: 'task', done: true }),
            makeTree('a2', '龙头', [], { role: 'task', color: 2, icon: '🔥' }),
          ]),
        ]),
        brainstorm: makeTree('br', '头脑风暴', [
          makeTree('i1', '点子', [makeTree('i2', '量尺寸', [], { role: 'task' })]),
        ]),
        links: [{ from: 'a1', to: 'a2', label: '同一供应商' }],
      }))
    })
    const screens: Record<string, string[]> = {}
    act(() => useEditor.getState().setView('map'))
    act(() => useEditor.getState().select('a2'))
    expect(await screen.findByTestId('node-check-a2')).toBeInTheDocument()
    expect(screen.getByTestId('node-progress-a')).toHaveTextContent('1/2')
    expect(screen.getByTestId('node-link-label-a1')).toHaveTextContent('同一供应商')
    screens.map = englishWords(container)

    // The link label prompt.
    fireEvent.click(screen.getByTestId('node-link-edit-a1'))
    await screen.findByTestId('prompt-dialog')
    screens.linkLabel = englishWords(container)
    fireEvent.keyDown(screen.getByTestId('prompt-dialog'), { key: 'Escape' })

    // The node menu with its task item.
    fireEvent.contextMenu(container.querySelector('.react-flow__node[data-id="a2"]')!)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    screens.nodeMenu = englishWords(container)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    // The colour and marker pickers.
    act(() => useUi.getState().setMarkerPicker({ section: 'map', id: 'a2', kind: 'color' }))
    await screen.findByTestId('marker-picker-color')
    screens.colorPicker = englishWords(container)
    act(() => useUi.getState().setMarkerPicker({ section: 'map', id: 'a2', kind: 'icon' }))
    await screen.findByTestId('marker-picker-icon')
    fireEvent.submit(screen.getByTestId('marker-custom').closest('form')!)
    screens.markerPicker = englishWords(container)
    act(() => useUi.getState().setMarkerPicker(null))

    act(() => useEditor.getState().setView('outline'))
    act(() => useEditor.getState().select('a'))
    expect(await screen.findByTestId('row-progress-a')).toBeInTheDocument()
    screens.outline = englishWords(container)

    act(() => useEditor.getState().setView('brainstorm'))
    act(() => useEditor.getState().select('i2'))
    expect(await screen.findByTestId('row-check-i2')).toBeInTheDocument()
    screens.brainstorm = englishWords(container)

    expect(screens).toEqual({
      map: [],
      linkLabel: [],
      nodeMenu: [],
      colorPicker: [],
      markerPicker: [],
      outline: [],
      brainstorm: [],
    })
  })

  it('shows no English on node tags, the tag filter and tag search (#150)', async () => {
    // jsdom has no scrolling; the Outline scrolls the last search result into view.
    Element.prototype.scrollIntoView ??= () => undefined
    const { container } = render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    await act(async () => {
      await useProjects.getState().createProject('项目')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: makeTree('m', '中心', [
          makeTree('a', '报价', [], { tags: ['优先', '销售', '季度', '网站'] }),
          makeTree('b', '后台', [makeTree('b1', '登录', [], { tags: ['优先'] })], {
            collapsed: true,
          }),
          makeTree('c', '推广'),
        ]),
      }))
    })
    const screens: Record<string, string[]> = {}
    act(() => useEditor.getState().setView('map'))
    act(() => useEditor.getState().select('a'))
    // Chips on the map and the tag field in the details panel.
    expect(await screen.findByTestId('tag-input')).toBeInTheDocument()
    const field = screen.getByTestId('tag-input')
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: '坏!' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    screens.details = englishWords(container)
    fireEvent.change(field, { target: { value: '' } })

    // The filter bar, the toolbar chip, dimmed nodes and "+1" on a folded branch.
    fireEvent.click(screen.getByTestId('tags-toggle'))
    fireEvent.click(await screen.findByTestId('tag-filter-优先'))
    expect(await screen.findByTestId('tag-filter-chip')).toBeInTheDocument()
    expect(await screen.findByTestId('node-tag-hits-b')).toBeInTheDocument()
    screens.filter = englishWords(container)
    fireEvent.click(screen.getByTestId('tag-filter-hide'))
    screens.hidden = englishWords(container)
    fireEvent.click(screen.getByTestId('tag-filter-chip-clear'))

    // "Tags…" for one node and "Add tags to 2 nodes".
    act(() => useUi.getState().setTagEditor({ section: 'map', ids: ['a'] }))
    await screen.findByTestId('tag-dialog')
    screens.tagDialog = englishWords(container)
    act(() => useUi.getState().setTagEditor({ section: 'map', ids: ['a', 'c'] }))
    await screen.findByTestId('tag-dialog-add')
    screens.tagDialogMany = englishWords(container)
    act(() => useUi.getState().setTagEditor(null))

    // #tag search and its count, then the Outline rows.
    fireEvent.change(screen.getByTestId('studio-search'), { target: { value: '#优先 ' } })
    expect(await screen.findByTestId('search-count')).toHaveTextContent('第 1 个，共 2 个')
    screens.search = englishWords(container)
    fireEvent.change(screen.getByTestId('studio-search'), { target: { value: '' } })
    act(() => useEditor.getState().setView('outline'))
    expect(await screen.findByTestId('outline-row-a')).toBeInTheDocument()
    screens.outline = englishWords(container)

    // The start screen finds the project by a node tag.
    await act(async () => {
      await useProjects.getState().createProject('另一个')
      await useProjects.getState().goHome()
    })
    await waitFor(() => expect(container.querySelector('.project-search')).not.toBeNull())
    fireEvent.change(container.querySelector('.project-search')!, { target: { value: '#优先' } })
    expect(await screen.findByTestId('project-tagged')).toHaveTextContent('2 个节点带有标签 #优先')
    screens.start = englishWords(container)

    expect(screens).toEqual({
      details: [],
      filter: [],
      hidden: [],
      tagDialog: [],
      tagDialogMany: [],
      outline: [],
      search: [],
      start: [],
    })
  })

  it('shows no English on images, the lightbox and image markers (#149)', async () => {
    const asset = `sha256-${'1'.repeat(64)}`
    const { container } = render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    await act(async () => {
      await useProjects.getState().createProject('项目')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: makeTree('m', '中心', [
          makeTree('a', '北墙', [], { image: { asset, w: 800, h: 600, alt: '窗户' } }),
          makeTree('b', '南墙', [], { image: { asset, w: 400, h: 400 } }),
        ]),
      }))
    })
    const screens: Record<string, string[]> = {}
    act(() => useEditor.getState().setView('map'))
    act(() => useEditor.getState().select('a'))
    // The picture is not stored here, so the placeholder says so.
    await waitFor(() =>
      expect(screen.getByTestId('node-image-a-missing')).toHaveTextContent('图片暂不可用'),
    )
    screens.map = englishWords(container)

    // The node menu with its image items.
    fireEvent.contextMenu(container.querySelector('.react-flow__node[data-id="a"]')!)
    expect(await screen.findByTestId('node-menu-remove-image')).toBeInTheDocument()
    screens.menu = englishWords(container)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    // The lightbox.
    act(() => useUi.getState().setImageViewer({ section: 'map', id: 'a' }))
    expect(await screen.findByTestId('image-lightbox')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('lightbox-stage')).toHaveTextContent('图片暂不可用'),
    )
    screens.lightbox = englishWords(container)
    act(() => useUi.getState().setImageViewer(null))

    // The picture in the details panel.
    act(() => useUi.getState().setDetailsPanel('shown'))
    expect(await screen.findByTestId('node-details-image')).toBeInTheDocument()
    screens.details = englishWords(container)
    act(() => useUi.getState().setDetailsPanel('hidden'))

    // The "with images" exports in Export ▾.
    act(() =>
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        brainstorm: makeTree('i', '想法', [
          makeTree('i1', '草图', [], { image: { asset, w: 100, h: 50 } }),
        ]),
      })),
    )
    fireEvent.click(within(screen.getByTestId('export-menu')).getAllByRole('button')[0])
    const jsonZip = await screen.findByRole('menuitem', { name: '项目 JSON 含图片（.zip）' })
    const markdownZip = screen.getByRole('menuitem', { name: 'Markdown 含图片（.zip）' })
    // Only the two new items: other entries name file types (.html, PDF) on purpose.
    screens.exportMenu = [...englishWords(jsonZip), ...englishWords(markdownZip)]
    fireEvent.click(within(screen.getByTestId('export-menu')).getAllByRole('button')[0])

    // The 🖼 markers and their preview in the Outline.
    act(() => useEditor.getState().setView('outline'))
    const marker = await screen.findByTestId('row-image-a')
    fireEvent.mouseEnter(marker.parentElement!)
    expect(await screen.findByTestId('row-image-preview-a')).toBeInTheDocument()
    screens.outline = englishWords(container)

    expect(screens).toEqual({
      map: [],
      menu: [],
      lightbox: [],
      details: [],
      exportMenu: [],
      outline: [],
    })
  })

  it('shows no English while presenting (#152)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    await act(async () => {
      await useProjects.getState().createProject('项目')
      useProjects.getState().updateCurrent((p) => ({
        ...p,
        map: makeTree('m', '中心', [
          makeTree('a', '订货', [
            makeTree('a1', '瓷砖', [], { role: 'task', done: true, notes: '备注' }),
            makeTree('a2', '龙头', [], { role: 'task', icon: '🔥' }),
          ]),
          makeTree('b', '另一个', [makeTree('b1', '藏起来')], { collapsed: true }),
        ]),
        links: [{ from: 'a1', to: 'b1', label: '同一供应商' }],
      }))
    })
    act(() => useEditor.getState().setView('map'))
    act(() => useUi.getState().setPresenting({ from: 'a1' }))
    const stage = await screen.findByTestId('present-stage')
    const screens: Record<string, string[]> = {}
    screens.stage = englishWords(container)
    // Captions, a typed step number and the blanked screen.
    fireEvent.keyDown(stage, { key: 'n' })
    fireEvent.keyDown(stage, { key: '2' })
    expect(screen.getByTestId('present-counter')).toHaveTextContent('跳到第 2 步')
    screens.typing = englishWords(container)
    fireEvent.keyDown(stage, { key: 'b' })
    screens.blank = englishWords(container)
    fireEvent.keyDown(stage, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('present-stage')).toBeNull())
    expect(screens).toEqual({ stage: [], typing: [], blank: [] })
  })

  it('names imported outlines and nameless projects in Chinese (#137)', () => {
    expect(parseMarkdown('- 一\n- 二\n').title).toBe('导入的大纲')
    const { project: repaired } = sanitizeProject({
      kind: 'project',
      schemaVersion: 1,
      name: '  ',
      preset: 'default',
      brainstorm: makeTree('b', '头脑风暴'),
      map: makeTree('m', '中心'),
    })
    expect(repaired.name).toBe('未命名项目')
  })

  it('shows no English in folder sync and GitHub milestones (#121)', async () => {
    const { container } = render(<App />)
    await waitFor(() => expect(useProjects.getState().loaded).toBe(true))
    const screens: Record<string, string[]> = {}

    // After a restart the browser wants permission again (#118).
    act(() => useSync.setState({ status: 'reconnect', folderName: '思维导图' }))
    await screen.findByTestId('sync-reconnect-prompt')
    screens.startReconnect = englishWords(container)

    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = async () => undefined
    act(() => useSync.setState({ status: 'off', folderName: null, dialogOpen: true }))
    await screen.findByTestId('sync-link')
    screens.syncNotLinked = englishWords(container)

    act(() =>
      useSync.setState({
        status: 'paused',
        folderName: '思维导图',
        lastSync: new Date().toISOString(),
        paused: { missing: 3, known: 4 },
        // Images still downloading or refused (#149).
        images: { pending: 2, rejected: 1 },
        skipped: (['unavailable', 'invalid', 'busy', 'open-unsaved', 'open-removed'] as const).map(
          (reason) => ({ file: '项目', reason }),
        ),
      }),
    )
    await screen.findByTestId('sync-confirm-deletes')
    await screen.findByTestId('sync-images-pending')
    await screen.findByTestId('sync-images-rejected')
    screens.syncLinked = englishWords(container)
    act(() => useSync.setState({ dialogOpen: false }))

    await act(async () => {
      await useProjects.getState().createProject('项目')
    })
    act(() => useUi.setState({ githubOpen: true }))
    await screen.findByTestId('github-repo')
    screens.githubSettings = englishWords(container)
    act(() => useUi.setState({ githubOpen: false }))

    await putSetting(GITHUB_SETTINGS_KEY, { repo: '我/导图', token: '令牌', folder: '导图' })
    act(() => useUi.setState({ githubOpen: true }))
    // The 10 MB image warning and missing images of a restored milestone (#149).
    act(() => {
      showToast(tn('github.imagesSkipped', 3), 'info', 15000)
    })
    await screen.findByText(/10 MB/)
    expect(englishWords(container)).toEqual([])
    act(() => {
      showToast(tn('github.imagesMissing', 1), 'info', 12000)
    })
    screens.githubSave = englishWords(container)

    expect(screens).toEqual({
      startReconnect: [],
      syncNotLinked: [],
      syncLinked: [],
      githubSettings: [],
      githubSave: [],
    })
  })
})
