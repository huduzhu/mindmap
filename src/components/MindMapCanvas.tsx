import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  ViewportPortal,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useT, type MessageKey } from '../i18n'
import { decorateLayout, type MapNodeData } from '../map/layout'
import { activeTagFilter, tagFilterView } from '../map/tags'
import { pruneHiddenByTags } from '../map/shownTree'
import { getCachedLayout, resetCachedLayout } from './canvasLayout'
import { clampMenuLeft } from './menuPosition'
import {
  applyDropIntent,
  resolveDropIntent,
  resolveDropPreview,
  type DropPreview,
} from '../map/drop'
import { arrowTarget, buildNav, isArrowKey } from '../map/navigate'
import { useResolvedPreset } from '../hooks/usePreset'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { isMinimapShown, MINIMAP_NODE_LIMIT, setMinimapShown } from '../store/session'
import { useUi } from '../store/ui'
import { announce } from '../a11y/announcer'
import { nodeAccessibleName } from '../a11y/describe'
import { isDarkColor } from '../hooks/useTheme'
import {
  addChild,
  addSibling,
  findNode,
  indentNode,
  makeNode,
  outdentNode,
  hasFoldedBranch,
  hasOpenBranch,
  removeNodes,
  setSide,
} from '../store/treeOps'
import { foldBranch, handleFoldKey, toggleFold } from './foldActions'
import { focusOn, handleFocusKey, viewRootOf } from './focusActions'
import { createDragSession } from '../map/dragSession'
import { FocusBarHost } from './lazyDialogs'
import { MapNode } from './MapNode'
import { MapEdge } from './MapEdge'
import { LinkEdge } from './LinkEdge'
import { OwnerFocusContext } from './ownerFocus'
import { NodeGestureContext } from './nodeGestures'
import { TouchActionBar } from './TouchActionBar'
import { copyFromMenu, pasteFromMenu } from './clipboardActions'
import { useBoxSelect } from './boxSelect'
import { useCoarsePointer } from '../hooks/useCoarsePointer'
import { indentBracket } from './indentKeys'
import { keyLabel } from './keyLabels'
import { openNotes } from './detailsPanel'
import { isToggleDoneKey, toggleTaskDone } from './taskActions'
import { editLinkLabel } from './linkActions'
import { presentationResizing } from './presentActions'
import { quote } from '../a11y/describe'
import { loadImages } from '../assets/intake'
import { dialogOpen } from './dialogOpen'
import { prefersReducedMotion } from '../a11y/motion'

const nodeTypes = { mapNode: MapNode }
/** The key hints under the canvas: key, then what it does (#74, #89). */
const HINTS: [string, MessageKey][] = [
  ['Tab', 'hint.child'],
  ['Enter', 'hint.sibling'],
  ['F2', 'hint.rename'],
  ['Ctrl+]', 'hint.indent'],
  ['Ctrl+[', 'hint.outdent'],
  ['Space', 'hint.collapse'],
  ['Alt+Shift+F', 'hint.flip'],
  ['Del', 'hint.remove'],
  ['Ctrl+Z', 'hint.undo'],
  ['Esc', 'hint.deselect'],
]

/** The node menu's image items (#149): view and remove only with a picture. */
const IMAGE_MENU: [string, MessageKey][] = [
  ['view', 'canvas.viewImage'],
  ['add', 'canvas.addImage'],
  ['remove', 'canvas.removeImage'],
]

/** Height the touch action bar takes at the bottom of the canvas, plus a gap (#91). */
const TOUCH_BAR_SPACE = 80

const edgeTypes = { mapEdge: MapEdge, linkEdge: LinkEdge }

interface NodeMenuState {
  nodeId: string
  x: number
  y: number
  /** Set when opened in the lower half of the window: the menu opens upwards from there. */
  bottom?: number | undefined
  /** The room left in the window that way; a longer menu scrolls (#150 made it longer). */
  maxHeight?: number | undefined
}

// Fitting a small map used to zoom in to maxZoom (2.5×), so a new project's root
// filled the canvas and ran off its edges. Never zoom past 100% when fitting.
const FIT_VIEW_OPTIONS = { padding: 0.25, maxZoom: 1 }
/**
 * Below this zoom titles are too small to read (#100). A map that only fits
 * at a smaller zoom opens at this one instead, centred on the selected node
 * (or the central topic); Fit View still shows the whole map on request.
 */
export const MIN_READABLE_ZOOM = 0.6

/** The map node under a point on screen, below any link drawn over it (#165). */
function nodeUnderPointer(x: number, y: number): string | null {
  if (typeof document.elementsFromPoint !== 'function') return null
  for (const element of document.elementsFromPoint(x, y)) {
    const node = element.closest<HTMLElement>('.react-flow__node')
    if (node?.dataset.id) return node.dataset.id
  }
  return null
}

/**
 * The card under a pointer event on a link, which takes the event (#165);
 * none when the pointer is on the link's label, which stays the link's (#202).
 */
function cardUnderLink(event: { target: EventTarget | null; clientX: number; clientY: number }) {
  const target = event.target as Element | null
  if (target?.closest?.('.react-flow__edge-textwrapper')) return null
  return nodeUnderPointer(event.clientX, event.clientY)
}

function pointerPosition(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }
  return { x: event.clientX, y: event.clientY }
}

export function MindMapCanvas() {
  // Focusing on a branch (#146) starts the canvas afresh, fitted to the branch.
  const focusId = useEditor((s) => s.focus.map)
  return (
    <div className="view-stack">
      <FocusBarHost view="map" />
      <ReactFlowProvider key={focusId ?? ''}>
        <MindMapCanvasInner />
      </ReactFlowProvider>
    </div>
  )
}

function MindMapCanvasInner() {
  const t = useT()
  const currentId = useProjects((s) => s.currentId)
  const project = useProjects((s) => s.current)
  const preset = useResolvedPreset(project?.preset ?? 'default')
  const selection = useEditor((s) => s.selection)
  const selectionSet = useEditor((s) => s.selectionSet)
  const editing = useEditor((s) => s.editing)
  const capturing = useEditor((s) => s.capturing)
  const revealId = useEditor((s) => s.revealId)
  const revealNonce = useEditor((s) => s.revealNonce)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const hintId = useId()
  const nodeMenuRef = useRef<HTMLDivElement>(null)
  const dragOffsetRef = useRef<{ id: string; x: number; y: number } | null>(null)
  // While a node is dragged (live test, item 2): where it is now, so the card
  // follows the pointer, and what letting go would do (highlighted parent and
  // an insertion line). Both are view state only; the drop itself still goes
  // through resolveDropIntent on drag stop.
  const [dragPosition, setDragPosition] = useState<{ id: string; x: number; y: number } | null>(
    null,
  )
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  // The node whose drag shows feedback: the primary selection when it started.
  const draggingIdRef = useRef<string | null>(null)
  // Whether the drag being dropped began here (#196).
  const [dragSession] = useState(() => createDragSession())
  useEffect(() => {
    dragSession.setOnAbandon?.(() => {
      dragOffsetRef.current = null
    })
  }, [dragSession])
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [nodeMenu, setNodeMenu] = useState<NodeMenuState | null>(null)
  const reactFlow = useReactFlow()

  const map = project?.map
  const links = project?.links
  // The branch the map is focused on (#146), laid out as if it were the root.
  const focusId = useEditor((s) => s.focus.map)
  const viewRoot = useMemo(() => (map ? viewRootOf(map, focusId) : undefined), [map, focusId])
  // Geometry depends on the tree, preset and links only; selection and editing
  // are applied afterwards, so an arrow-key press no longer re-runs the whole
  // @antv/hierarchy pass (#64).
  // The last layout, so an edit hands React Flow back the node and edge
  // objects it already knows for everything that did not move or change (#140).
  // The tag filter (#150): hide mode lays out only the matches and their path
  // to the root (plus the node being renamed); highlight mode dims the rest.
  // The filter maths comes with the filter bar, which is what switches it on.
  const filterOn = useEditor((s) => activeTagFilter(s.tagFilter.map))
  const tagView = filterOn ? tagFilterView() : null
  const tagFilter = tagView ? filterOn : null
  const keepId = tagFilter?.hide ? editing : null
  const shownRoot = useMemo(
    () => (viewRoot ? pruneHiddenByTags(viewRoot, tagFilter, keepId) : viewRoot),
    [viewRoot, tagFilter, keepId],
  )
  const tagResult = useMemo(
    () => (viewRoot && tagView && tagFilter ? tagView.apply(viewRoot, tagFilter) : null),
    [viewRoot, tagView, tagFilter],
  )
  const geometry = useMemo(() => {
    // The version bump also re-syncs React Flow's controlled positions after an
    // invalid drop, so that pass starts afresh instead of reusing the old objects.
    return getCachedLayout(currentId, shownRoot, preset, links, layoutVersion)
  }, [currentId, shownRoot, links, preset, layoutVersion])
  const tagged = useMemo(
    () => (tagView ? tagView.decorate(geometry, tagResult, !tagFilter?.hide) : geometry),
    [geometry, tagView, tagResult, tagFilter],
  )
  const { nodes, edges } = useMemo(
    () => decorateLayout(tagged, selection, editing, selectionSet),
    [tagged, selection, editing, selectionSet],
  )
  const nav = useMemo(() => buildNav(geometry.nodes, geometry.edges), [geometry])
  // Only the dragged node and the drop target get new objects, so React Flow
  // keeps every other node as it is while dragging.
  // The whole branch moves with the dragged node, so its children do not stay
  // behind on stretched edges.
  const draggedId = dragPosition?.id ?? null
  const draggedBranch = useMemo(() => {
    const ids = new Set<string>()
    if (!draggedId) return ids
    const stack = [draggedId]
    while (stack.length > 0) {
      const id = stack.pop()!
      ids.add(id)
      // The laid-out children, not a scan of every node per node (#203).
      for (const child of nav.childrenOf.get(id) ?? []) stack.push(child)
    }
    return ids
  }, [draggedId, nav])
  const shownNodes = useMemo(() => {
    if (!dragPosition && !dropPreview) return nodes
    const origin = dragPosition ? nodes.find((node) => node.id === dragPosition.id) : undefined
    const dx = origin && dragPosition ? dragPosition.x - origin.position.x : 0
    const dy = origin && dragPosition ? dragPosition.y - origin.position.y : 0
    return nodes.map((node) => {
      const moving = draggedBranch.has(node.id)
      const target = dropPreview?.targetId === node.id
      if (!moving && !target) return node
      const className = [
        node.className,
        moving ? 'map-dragging' : '',
        target ? 'map-drop-target' : '',
      ]
        .filter(Boolean)
        .join(' ')
      return {
        ...node,
        className,
        ...(moving
          ? { position: { x: node.position.x + dx, y: node.position.y + dy }, zIndex: 1000 }
          : {}),
      }
    })
  }, [nodes, dragPosition, dropPreview, draggedBranch])
  // Cross-links say which nodes they join, and their label (#148c), instead of
  // React Flow's "Edge from <id> to <id>". Tree edges keep their objects.
  const shownEdges = useMemo(
    () =>
      edges.map((edge) => {
        if (edge.type !== 'linkEdge') return edge
        const pair = {
          a: quote(nav.nodeById.get(edge.source)?.data.node.title ?? ''),
          b: quote(nav.nodeById.get(edge.target)?.data.node.title ?? ''),
        }
        const ariaLabel =
          typeof edge.label === 'string'
            ? t('a11y.linkLabelled', { ...pair, label: quote(edge.label) })
            : t('a11y.link', pair)
        return { ...edge, ariaLabel }
      }),
    [edges, nav, t],
  )

  // Say where the keyboard selection landed (#85). Edits announce themselves
  // from the editor store; this follows them rather than replacing them.
  const spokenSelectionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selection || selection === spokenSelectionRef.current) return
    spokenSelectionRef.current = selection
    if (document.activeElement !== wrapperRef.current) return
    const node = geometry.nodes.find((candidate) => candidate.id === selection)
    if (node) announce(nodeAccessibleName(node.data.node, node.data.depth), { append: true })
  }, [selection, geometry])

  const closeNodeMenu = useCallback(() => setNodeMenu(null), [])
  const coarse = useCoarsePointer()
  const coarseRef = useRef(coarse)
  useEffect(() => {
    coarseRef.current = coarse
  })
  const touchNode = selection && selectionSet.size <= 1 ? nav.nodeById.get(selection) : undefined

  const openNodeMenu = useCallback((nodeId: string, x: number, y: number) => {
    // The menu has grown (#145, #146): open it upwards in the lower half of the
    // window so it is not cut off at the bottom.
    const height = window.innerHeight
    const up = height > 0 && y > height / 2
    setNodeMenu({
      nodeId,
      // Its real width is known only once drawn; see the layout effect below.
      x: clampMenuLeft(x, 0, window.innerWidth),
      y,
      bottom: up ? height - y : undefined,
      maxHeight: height > 0 ? Math.max(120, (up ? y : height - y) - 8) : undefined,
    })
  }, [])

  const keyboardMenuPosition = useCallback((nodeId: string) => {
    const element = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node')).find(
      (candidate) => candidate.dataset.id === nodeId,
    )
    const bounds = element?.getBoundingClientRect()
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    }
    const wrapper = wrapperRef.current?.getBoundingClientRect()
    return wrapper
      ? { x: wrapper.left + wrapper.width / 2, y: wrapper.top + wrapper.height / 2 }
      : { x: 0, y: 0 }
  }, [])

  const deleteSelection = useCallback(
    (primaryId: string) => {
      const current = useProjects.getState().current
      if (!current) return
      const editor = useEditor.getState()
      const located = findNode(current.map, primaryId)
      const selectedIds = new Set(editor.selectionSet)
      selectedIds.add(primaryId)
      // Only nodes the map shows: never ones folded away or filtered out (#199).
      const deletable = new Set(
        [...selectedIds].filter(
          (id) => id !== current.map.id && nav.nodeById.has(id) && findNode(current.map, id),
        ),
      )
      if (deletable.size === 0) return

      let fallback = current.map.id
      let parent = located?.parent ?? null
      while (parent) {
        if (!deletable.has(parent.id)) {
          fallback = parent.id
          break
        }
        parent = findNode(current.map, parent.id)?.parent ?? null
      }

      editor.applyTree('map', (tree) => removeNodes(tree, deletable))
      const nextTree = useProjects.getState().current?.map
      editor.select(nextTree && findNode(nextTree, fallback) ? fallback : current.map.id)
    },
    [nav],
  )

  const addChildFromMenu = useCallback(
    (parentId: string) => {
      const child = makeNode(t('node.newIdea'))
      const editor = useEditor.getState()
      editor.startDraft('map', child, (tree) => addChild(tree, parentId, child), parentId)
      editor.ensureVisible(child.id)
    },
    [t],
  )

  const addSiblingFromMenu = useCallback(
    (nodeId: string) => {
      const sibling = makeNode(t('node.newIdea'))
      const editor = useEditor.getState()
      editor.startDraft('map', sibling, (tree) => addSibling(tree, nodeId, sibling), nodeId)
      editor.ensureVisible(sibling.id)
    },
    [t],
  )

  // Touch gestures on nodes (#91): long-press = node menu, double-tap = rename.
  const gestures = useMemo(
    () => ({
      openMenu: (id: string, x: number, y: number) => {
        const editor = useEditor.getState()
        if (!editor.selectionSet.has(id)) editor.select(id)
        openNodeMenu(id, x, y)
      },
      rename: (id: string) => {
        const editor = useEditor.getState()
        editor.select(id)
        editor.setEditing(id)
      },
    }),
    [openNodeMenu],
  )

  const addLinkFromSelection = useCallback(() => {
    const current = useProjects.getState().current
    const selected = [...useEditor.getState().selectionSet]
    if (!current || selected.length !== 2 || selected.some((id) => !findNode(current.map, id)))
      return
    const link = { from: selected[0], to: selected[1] }
    if (
      current.links?.some((candidate) => candidate.from === link.from && candidate.to === link.to)
    )
      return
    useEditor.getState().applyLinks((links) => [...links, link])
  }, [])

  const removeLinkFromSelection = useCallback(() => {
    const current = useProjects.getState().current
    const selected = [...useEditor.getState().selectionSet]
    if (!current || selected.length !== 2) return
    const [first, second] = selected
    useEditor.getState().applyLinks((links) => {
      const next = links.filter(
        (link) =>
          !(
            (link.from === first && link.to === second) ||
            (link.from === second && link.to === first)
          ),
      )
      return next.length === links.length ? links : next
    })
  }, [])

  const menuNode = nodeMenu ? nav.nodeById.get(nodeMenu.nodeId) : undefined
  const menuIsRoot = Boolean(menuNode?.data.isRoot)
  // A focused branch's own node can still be deleted, cut and exported (#146).
  const menuIsMapRoot = Boolean(nodeMenu && project && nodeMenu.nodeId === project.map.id)
  const menuHasChildren = Boolean(menuNode?.data.hasChildren)
  const menuCanAddSibling = Boolean(nodeMenu && nav.parentOf.has(nodeMenu.nodeId))
  const menuCanFlipSide = Boolean(
    nodeMenu && project && nav.parentOf.get(nodeMenu.nodeId) === project.map.id,
  )
  const menuLinkPair = useMemo(() => {
    if (!nodeMenu || selectionSet.size !== 2 || !selectionSet.has(nodeMenu.nodeId)) return null
    const [first, second] = [...selectionSet]
    const hasLink = Boolean(
      project?.links?.some(
        (link) =>
          (link.from === first && link.to === second) ||
          (link.from === second && link.to === first),
      ),
    )
    return { hasLink }
  }, [nodeMenu, project?.links, selectionSet])

  // Near the right edge, move the menu left so all of it is on screen. Measured
  // once drawn, since its width depends on the labels (and the language).
  useLayoutEffect(() => {
    const menu = nodeMenuRef.current
    if (!nodeMenu || !menu) return
    const left = clampMenuLeft(nodeMenu.x, menu.getBoundingClientRect().width, window.innerWidth)
    menu.style.left = `${left}px`
  }, [nodeMenu])

  // Keep focus contained while open, and restore the canvas focus when the menu closes. The
  // cleanup runs before RenameInput's focus effect, so Rename still focuses its input.
  useEffect(() => {
    if (!nodeMenu) return
    const menu = nodeMenuRef.current
    const wrapper = wrapperRef.current
    if (!menu) return
    const items = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])'),
    )
    items[0]?.focus()
    const onClickAway = (event: MouseEvent | PointerEvent) => {
      if (!menu.contains(event.target as HTMLElement)) closeNodeMenu()
    }
    document.addEventListener('mousedown', onClickAway)
    document.addEventListener('pointerdown', onClickAway)
    document.addEventListener('click', onClickAway)
    return () => {
      document.removeEventListener('mousedown', onClickAway)
      document.removeEventListener('pointerdown', onClickAway)
      document.removeEventListener('click', onClickAway)
      wrapper?.focus()
    }
  }, [nodeMenu, closeNodeMenu])

  useEffect(() => {
    wrapperRef.current?.focus()
  }, [])

  useEffect(() => {
    // Skip the clear while editing matches selection — that's the transient state created by
    // Tab/Enter on the canvas, where the new node's id is set on selection before the parent
    // re-renders with the updated project prop (so nav is still built from the old map).
    // Re-checked after the document-level move (#5): "stale" still means "selection names a
    // node that is no longer in the laid-out tree", regardless of where focus or the keydown
    // originated — the bootstrap below only ever selects ids that exist in nav.
    if (selection && editing !== selection && !nav.nodeById.has(selection)) {
      useEditor.getState().select(null)
    }
  }, [selection, editing, nav])

  // Keep a node on screen without changing the zoom. React Flow's setCenter
  // defaults to maxZoom (2.5×) when no zoom is passed, so every new node or
  // search hit used to zoom the map right in (#73). Nodes already fully visible
  // are left where they are, so adding a node no longer jerks the view.
  const userMovedRef = useRef(false)
  const [minimapWanted, setMinimapWanted] = useState(isMinimapShown)
  // On a big map the overview stays hidden unless asked for (#139); asking
  // lasts while this map view is open and is not remembered.
  const [largeMinimapForced, setLargeMinimapForced] = useState(false)
  const largeMap = geometry.nodes.length > MINIMAP_NODE_LIMIT
  const minimapShown = minimapWanted && (!largeMap || largeMinimapForced)
  const minimapLabel = minimapShown
    ? t('canvas.hideOverview')
    : largeMap && minimapWanted
      ? t('canvas.overviewOffLarge', { count: MINIMAP_NODE_LIMIT })
      : t('canvas.showOverview')
  const toggleMinimap = () => {
    if (minimapShown && largeMap) {
      // Hide it for this big map only; small maps keep the saved choice.
      setLargeMinimapForced(false)
      return
    }
    const next = !minimapShown
    setMinimapWanted(next)
    setMinimapShown(next)
    if (next && largeMap) setLargeMinimapForced(true)
  }
  const geometryRef = useRef(geometry)
  const placedNodesRef = useRef(geometry.nodes)
  useEffect(() => {
    geometryRef.current = geometry
    placedNodesRef.current = geometry.nodes
  })
  const toFlow = useCallback(
    (point: { x: number; y: number }) => reactFlow.screenToFlowPosition(point),
    [reactFlow],
  )
  const boxSelect = useBoxSelect({ wrapperRef, nodesRef: placedNodesRef, toFlow })
  const bringIntoView = useCallback(
    (id: string, instant = false) => {
      const node = geometryRef.current.nodes.find((n) => n.id === id)
      const wrapper = wrapperRef.current
      if (!node || !wrapper) return
      const { x, y, zoom } = reactFlow.getViewport()
      const { width: viewWidth, height: viewHeight } = wrapper.getBoundingClientRect()
      const width = node.width ?? 0
      const height = node.height ?? 0
      const left = node.position.x * zoom + x
      const top = node.position.y * zoom + y
      const margin = 24
      // On touch devices the action bar covers the bottom of the canvas (#91).
      const bottomInset = coarseRef.current ? TOUCH_BAR_SPACE : 0
      const visible =
        left >= margin &&
        top >= margin &&
        left + width * zoom <= viewWidth - margin &&
        top + height * zoom <= viewHeight - margin - bottomInset
      if (visible || viewWidth === 0 || viewHeight === 0) return
      void reactFlow.setCenter(
        node.position.x + width / 2,
        node.position.y + height / 2 + bottomInset / 2 / zoom,
        // No animated pan when the system asks for less motion (#175).
        { zoom, duration: instant || prefersReducedMotion() ? 0 : 180 },
      )
    },
    [reactFlow],
  )

  const fitReadable = useCallback(async () => {
    await reactFlow.fitView(FIT_VIEW_OPTIONS)
    if (reactFlow.getZoom() >= MIN_READABLE_ZOOM) return
    const nodes = geometryRef.current.nodes
    const selected = useEditor.getState().selection
    const focus = nodes.find((n) => n.id === selected) ?? nodes.find((n) => n.data.isRoot)
    if (!focus) return
    await reactFlow.setCenter(
      focus.position.x + (focus.width ?? 0) / 2,
      focus.position.y + (focus.height ?? 0) / 2,
      { zoom: MIN_READABLE_ZOOM },
    )
  }, [reactFlow])

  // The first fit once the nodes are known (replaces React Flow's fitView prop).
  const nodesInitialized = useNodesInitialized()
  const fittedRef = useRef(false)
  useEffect(() => {
    if (!nodesInitialized || fittedRef.current) return
    fittedRef.current = true
    void fitReadable()
  }, [nodesInitialized, fitReadable])

  // React Flow only renders nodes in view (onlyRenderVisibleElements). A node
  // being renamed must stay mounted, or its rename box disappears with it and
  // the keyboard stays stuck in rename mode (N7). Rendering every node whenever
  // anything was renamed made each Tab/F2 on a big map mount all of them — the
  // bulk of a ~650 ms delay at 1,500 nodes (#97). Now everything is rendered
  // only while the node being renamed is actually off screen, which is rare
  // and brief: a node that starts its rename off screen (a new node laid out
  // away from the view) is brought into view at once instead.
  // The node being renamed when a pan or zoom took it off screen; everything
  // is rendered only while that node is still the one being renamed. Set from
  // React Flow's move events only, never from an effect.
  const [offscreenEdit, setOffscreenEdit] = useState<string | null>(null)
  const renderAll = editing !== null && offscreenEdit === editing
  const isOnScreen = useCallback(
    (id: string) => {
      const node = geometryRef.current.nodes.find((n) => n.id === id)
      const wrapper = wrapperRef.current
      if (!node || !wrapper) return true
      const { x, y, zoom } = reactFlow.getViewport()
      const { width: viewWidth, height: viewHeight } = wrapper.getBoundingClientRect()
      if (viewWidth === 0 || viewHeight === 0) return true
      const left = node.position.x * zoom + x
      const top = node.position.y * zoom + y
      return (
        left < viewWidth &&
        top < viewHeight &&
        left + (node.width ?? 0) * zoom > 0 &&
        top + (node.height ?? 0) * zoom > 0
      )
    },
    [reactFlow],
  )
  const checkRenderAll = useCallback(() => {
    const id = useEditor.getState().editing
    const next = id !== null && !isOnScreen(id) ? id : null
    setOffscreenEdit((current) => (current === next ? current : next))
  }, [isOnScreen])
  // A node that starts its rename off screen (laid out away from the view) is
  // brought into view at once, so it never needs everything rendered.
  useEffect(() => {
    if (editing && !isOnScreen(editing)) bringIntoView(editing, true)
  }, [editing, geometry, isOnScreen, bringIntoView])

  // Keep the selected node clear of the touch action bar (#91).
  useEffect(() => {
    if (!coarse || !selection) return
    bringIntoView(selection)
    // Again once React Flow's own initial fit has settled.
    const timer = setTimeout(() => bringIntoView(selection), 300)
    return () => clearTimeout(timer)
  }, [coarse, selection, bringIntoView])

  useEffect(() => {
    if (!revealId || !revealNonce) return
    // Positions come from the geometry, so a selection change alone no longer
    // re-centres on the last revealed node (#64).
    bringIntoView(revealId)
  }, [revealId, revealNonce, geometry, bringIntoView])

  // Opening or closing the details panel resizes the canvas without moving the
  // viewport, which pushed right-hand nodes (often the one just selected) out of
  // view (#73). Pan the selection back in when the canvas size changes.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || typeof ResizeObserver === 'undefined') return
    let last = wrapper.getBoundingClientRect()
    const observer = new ResizeObserver(() => {
      const size = wrapper.getBoundingClientRect()
      // Width: the details panel beside the map; height: the bottom sheet on phones.
      if (Math.abs(size.width - last.width) < 1 && Math.abs(size.height - last.height) < 1) return
      // A presentation going full screen resizes the window; leave the map as it was (#152).
      if (presentationResizing()) return
      last = size
      // Until the user pans or zooms, keep the whole map fitted: on open (or a
      // reload, #75) the details panel appears right after the initial fit and
      // would otherwise push part of the map out of view.
      if (!userMovedRef.current) {
        void fitReadable().then(() => {
          // …but on touch, not under the action bar (#91).
          const selected = useEditor.getState().selection
          if (coarseRef.current && selected) bringIntoView(selected)
        })
        return
      }
      const selected = useEditor.getState().selection
      if (selected) bringIntoView(selected)
    })
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [bringIntoView, fitReadable])

  // Document-level keydown (#5): the shortcuts must work no matter where focus currently
  // sits — wrapper, body, or the details-panel container. The bail rejects only real
  // interactive elements (inputs, buttons, selects, textareas, links, contenteditable), so
  // a keypress while the notes textarea is focused still edits notes, but "focus fell to
  // body" is no longer fatal. Deliberately NOT a strict e.target === wrapper guard — that
  // was retracted in the Batch 8 verification and is locked out by HANDOFF §0.5(1).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Nothing reaches the map behind an open dialog (#166).
      if (dialogOpen()) return
      // Alt+. / Alt+, / Alt+1…3 fold what the map shows (#145).
      const target = e.target as HTMLElement | null
      // The node menu handles its own keys.
      if (target?.closest('[role="menu"]')) return
      if (handleFoldKey(e, 'map', viewRoot?.id)) return
      if (target?.closest('button, input, textarea, select, a, [contenteditable="true"]')) return

      // Undo/redo first — must work even while renaming (undo() clears editing internally),
      // otherwise a fresh "New idea" draft gets stuck if the user hits Ctrl+Z before committing.
      // Not with Alt: Ctrl+Alt is AltGr on many keyboards, which types characters.
      const undoCombo = (e.ctrlKey || e.metaKey) && !e.altKey
      if (undoCombo && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        const editor = useEditor.getState()
        if (e.shiftKey) editor.redo()
        else editor.undo()
        return
      }
      if (undoCombo && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        useEditor.getState().redo()
        return
      }

      const editor = useEditor.getState()
      if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
        if (editor.editing || !project || !editor.selection || !nav.nodeById.has(editor.selection))
          return
        e.preventDefault()
        const position = keyboardMenuPosition(editor.selection)
        openNodeMenu(editor.selection, position.x, position.y)
        return
      }
      if (editor.editing) return
      // Alt+→ focuses on the selected branch; Alt+← and Esc go back up (#146).
      if (handleFocusKey(e, 'map')) return

      // Escape deselects. With nothing selected Tab is no longer a shortcut, so
      // keyboard users can Tab out of the canvas instead of being trapped (#74).
      if (e.key === 'Escape') {
        if (!editor.selection && editor.selectionSet.size === 0) return
        e.preventDefault()
        editor.select(null)
        wrapperRef.current?.focus()
        return
      }

      let sel = editor.selection
      if (!sel || !nav.nodeById.has(sel)) {
        // Keyboard bootstrap (#5, mirrors the outliner): Arrow/Enter from a null or stale
        // selection picks up the root instead of dead-ending. F2/Tab/Del stay no-ops without
        // a selection — they need a target the user has not named yet.
        if (!project || !viewRoot) return
        if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          sel = viewRoot.id
          editor.select(sel)
          if (e.key !== 'Enter') {
            e.preventDefault()
            return
          }
        } else {
          return
        }
      }

      // Ctrl/Cmd+Enter marks a task done or not done (#148a); plain Enter adds a sibling.
      if (isToggleDoneKey(e)) {
        e.preventDefault()
        toggleTaskDone('map', sel)
        return
      }

      // Ctrl+] / Ctrl+[ indent and outdent (#131): Windows keeps Alt+Tab for
      // switching windows, so that binding is only a secondary one.
      // Outdenting a child of a focused branch would take it out of view (#146).
      const leavesView = nav.parentOf.get(sel) === viewRoot?.id
      const bracket = indentBracket(e)
      if (bracket) {
        e.preventDefault()
        if (bracket === 'outdent' && leavesView) return
        const target = sel
        editor.applyTree('map', (tree) =>
          bracket === 'outdent' ? outdentNode(tree, target) : indentNode(tree, target),
        )
        // The moved branch can land beyond the edge of the view; keep it in sight.
        editor.ensureVisible(target)
        return
      }

      // Alt+Shift+F flips a main branch to the other side. It was Alt+Shift+S,
      // which Windows 11 and Edge take for their own (live test, item 5). The
      // physical key is matched, so Option+Shift+F works on a Mac as well.
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyF') {
        if (nav.parentOf.get(sel) !== project?.map.id) return
        e.preventDefault()
        const target = sel
        const side = nav.nodeById.get(target)?.data.side === 'left' ? 'right' : 'left'
        editor.applyTree('map', (tree) => setSide(tree, target, side))
        return
      }

      switch (e.key) {
        case 'F2':
          e.preventDefault()
          editor.setEditing(sel)
          break
        case 'Tab': {
          // Plain Shift+Tab is the browser's: focus leaves the canvas backwards
          // instead of the key adding a child (#201).
          if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) return
          e.preventDefault()
          if (e.altKey) {
            if (e.shiftKey && leavesView) break
            editor.applyTree('map', (tree) =>
              e.shiftKey ? outdentNode(tree, sel) : indentNode(tree, sel),
            )
            editor.ensureVisible(sel)
            break
          }
          const child = makeNode(t('node.newIdea'))
          editor.startDraft('map', child, (tree) => addChild(tree, sel, child), sel)
          editor.ensureVisible(child.id)
          break
        }
        case 'Enter': {
          e.preventDefault()
          const created = makeNode(t('node.newIdea'))
          const parent = nav.parentOf.get(sel)
          editor.startDraft(
            'map',
            created,
            (tree) => (parent ? addSibling(tree, sel, created) : addChild(tree, sel, created)),
            sel,
          )
          editor.ensureVisible(created.id)
          break
        }
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          deleteSelection(sel)
          break
        case ' ': {
          const data = nav.nodeById.get(sel)?.data
          // Space folds; on a node with a picture and no children (or with
          // Shift) it opens the picture instead (#149).
          if (data?.node.image && (e.shiftKey || !data.hasChildren)) {
            e.preventDefault()
            useUi.getState().setImageViewer({ section: 'map', id: sel })
            break
          }
          if (!data?.hasChildren) break
          e.preventDefault()
          toggleFold('map', sel)
          break
        }
        case 'ArrowRight':
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'ArrowDown': {
          // Side-aware: ← from the central topic goes left, and ↑/↓ stay on
          // the side of the map the selection is on (#133).
          e.preventDefault()
          const next = isArrowKey(e.key) ? arrowTarget(nav, sel, e.key) : null
          if (next) editor.select(next)
          break
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [deleteSelection, keyboardMenuPosition, nav, openNodeMenu, project, t, viewRoot])

  const endDragFeedback = useCallback(() => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
    dragFrameRef.current = null
    draggingIdRef.current = null
    setDragPosition(null)
    setDropPreview(null)
  }, [])

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<MapNodeData>>[]) => {
      for (const change of changes) {
        if (change.type !== 'position') continue
        // React Flow moves every selected node; only the one being dropped
        // follows the pointer (#162).
        if (change.id !== draggingIdRef.current) continue
        // A drag that ends without onNodeDragStop (a second finger, the node
        // deleted mid-drag) still clears its feedback (#160).
        if (!change.dragging) {
          endDragFeedback()
          dragSession.ended()
        } else if (change.position) {
          setDragPosition({ id: change.id, x: change.position.x, y: change.position.y })
        }
      }
    },
    [dragSession, endDragFeedback],
  )

  // No animation frame outlives the canvas.
  useEffect(
    () => () => {
      if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
    },
    [],
  )

  // The dragged node was deleted or undone away mid-drag (#160).
  useEffect(() => {
    if (draggingIdRef.current && !nav.nodeById.has(draggingIdRef.current)) endDragFeedback()
  }, [nav, endDragFeedback])

  /** The point the drop is judged at: where the pointer holds the node. */
  const dropPointOf = (node: Node<MapNodeData>) => {
    const offset = dragOffsetRef.current?.id === node.id ? dragOffsetRef.current : null
    return offset
      ? { x: node.position.x + offset.x, y: node.position.y + offset.y }
      : { x: node.position.x + (node.width ?? 0) / 2, y: node.position.y + (node.height ?? 0) / 2 }
  }

  const onNodeDrag = (_event: MouseEvent | TouchEvent, node: Node<MapNodeData>) => {
    // Esc (or any selection change) mid-drag: the drop will be ignored, so the
    // card goes back and no preview promises otherwise (#164).
    if (useEditor.getState().selection !== node.id || draggingIdRef.current !== node.id) {
      if (draggingIdRef.current) endDragFeedback()
      return
    }
    const point = dropPointOf(node)
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null
      const current = useProjects.getState().current
      const next = current
        ? resolveDropPreview(current.map, nodes, node.id, point, viewRoot?.id)
        : null
      setDropPreview((previous) =>
        previous &&
        next &&
        previous.targetId === next.targetId &&
        previous.flipTo === next.flipTo &&
        previous.line.x === next.line.x &&
        previous.line.y === next.line.y &&
        previous.line.width === next.line.width
          ? previous
          : next,
      )
    })
  }

  const onNodeDragStart = (event: MouseEvent | TouchEvent, node: Node<MapNodeData>) => {
    // Dragging a node that is not selected selects it first, so the drag is
    // not silently ignored (live test, item 2); a secondary node of a
    // multi-selection still keeps the selection as it is.
    const editor = useEditor.getState()
    if (!editor.selectionSet.has(node.id)) editor.select(node.id)
    draggingIdRef.current = useEditor.getState().selection === node.id ? node.id : null
    dragSession.begin(node.id)
    const pointer = pointerPosition(event)
    if (!pointer) return
    const element = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node')).find(
      (candidate) => candidate.dataset.id === node.id,
    )
    const bounds = element?.getBoundingClientRect()
    const usableBounds = bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null
    const zoom = usableBounds && node.width ? usableBounds.width / node.width : 1
    dragOffsetRef.current = {
      id: node.id,
      x: usableBounds ? (pointer.x - usableBounds.left) / zoom : (node.width ?? 0) / 2,
      y: usableBounds ? (pointer.y - usableBounds.top) / zoom : (node.height ?? 0) / 2,
    }
  }

  const onNodeDragStop = (event: MouseEvent | TouchEvent, node: Node<MapNodeData>) => {
    endDragFeedback()
    // React Flow stops a drag it never reported starting after a second
    // finger abandoned the last one (#196): put the card back, move nothing.
    if (!dragSession.stop(node.id)) {
      dragOffsetRef.current = null
      resetCachedLayout()
      setLayoutVersion((version) => version + 1)
      return
    }
    const pointer = pointerPosition(event)
    const dropPoint = pointer
      ? dropPointOf(node)
      : { x: node.position.x + (node.width ?? 0) / 2, y: node.position.y + (node.height ?? 0) / 2 }
    dragOffsetRef.current = null
    const current = useProjects.getState().current
    if (!current) {
      resetCachedLayout()
      setLayoutVersion((version) => version + 1)
      return
    }
    // A multi-selection is visual state only for dragging: reparent the primary
    // node, never every selected node (and ignore a drag that started on a secondary).
    if (useEditor.getState().selection !== node.id) {
      resetCachedLayout()
      setLayoutVersion((version) => version + 1)
      return
    }
    const intent = resolveDropIntent(current.map, nodes, node.id, dropPoint, viewRoot?.id)
    if (!intent) {
      resetCachedLayout()
      setLayoutVersion((version) => version + 1)
      return
    }

    useEditor.getState().applyTree('map', (tree) => {
      return applyDropIntent(tree, node.id, intent)
    })
    useEditor.getState().select(node.id)
    // The moved branch can land beyond the edge of the view, where the canvas
    // does not draw it; keep it in sight, as indent and outdent do.
    useEditor.getState().ensureVisible(node.id)
    resetCachedLayout()
    setLayoutVersion((version) => version + 1)
  }

  return (
    <OwnerFocusContext.Provider value={wrapperRef}>
      <NodeGestureContext.Provider value={gestures}>
        <div
          ref={wrapperRef}
          className="canvas-wrap"
          tabIndex={0}
          data-testid="map-canvas"
          // The canvas handles its own keys (Tab, Enter, arrows…), so screen
          // readers should pass them through rather than use them to browse.
          role="application"
          aria-roledescription={t('canvas.roledescription')}
          aria-label={
            project ? t('canvas.label', { title: project.map.title }) : t('canvas.labelEmpty')
          }
          aria-describedby={hintId}
          onPointerDownCapture={boxSelect.onPointerDownCapture}
          onMouseDownCapture={boxSelect.onMouseDownCapture}
        >
          {boxSelect.box ? (
            <div
              className="canvas-select-box"
              data-testid="select-box"
              style={boxSelect.box}
              aria-hidden="true"
            />
          ) : null}
          <ReactFlow
            nodes={shownNodes}
            edges={shownEdges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitViewOptions={FIT_VIEW_OPTIONS}
            // React Flow's own labels and screen-reader hints, in the app's language (#99).
            ariaLabelConfig={{
              'node.a11yDescription.default': t('rf.nodeDescription'),
              'node.a11yDescription.keyboardDisabled': t('rf.nodeDescription'),
              'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) =>
                t('rf.nodeMoved', { direction, x, y }),
              'edge.a11yDescription.default': t('rf.edgeDescription'),
              'controls.ariaLabel': t('rf.controls'),
              'controls.zoomIn.ariaLabel': t('rf.zoomIn'),
              'controls.zoomOut.ariaLabel': t('rf.zoomOut'),
              'controls.fitView.ariaLabel': t('rf.fitView'),
              'controls.interactive.ariaLabel': t('rf.interactive'),
              'minimap.ariaLabel': t('rf.minimap'),
              'handle.ariaLabel': t('rf.handle'),
            }}
            // Controls and minimap follow the palette (#86); they default to light.
            colorMode={isDarkColor(preset.palette.background) ? 'dark' : 'light'}
            minZoom={0.15}
            maxZoom={2.5}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable={false}
            nodesFocusable={false}
            onlyRenderVisibleElements={!capturing && !renderAll}
            onNodeClick={(event, node) => useEditor.getState().select(node.id, event.shiftKey)}
            onNodeContextMenu={(event, node) => {
              event.preventDefault()
              event.stopPropagation()
              const editor = useEditor.getState()
              if (!editor.selectionSet.has(node.id)) editor.select(node.id)
              openNodeMenu(node.id, event.clientX, event.clientY)
            }}
            onEdgeClick={(event, edge) => {
              // A link drawn across a card: the click is the card's (#165).
              if (edge.type !== 'linkEdge') return
              const under = cardUnderLink(event)
              if (under) useEditor.getState().select(under, event.shiftKey)
            }}
            onEdgeContextMenu={(event, edge) => {
              // Right-clicking a link over a card opens the card's menu (#202).
              if (edge.type !== 'linkEdge') return
              const under = cardUnderLink(event)
              if (!under) return
              event.preventDefault()
              event.stopPropagation()
              const editor = useEditor.getState()
              if (!editor.selectionSet.has(under)) editor.select(under)
              openNodeMenu(under, event.clientX, event.clientY)
            }}
            onEdgeDoubleClick={(event, edge) => {
              if (edge.type !== 'linkEdge') return
              event.preventDefault()
              event.stopPropagation()
              // Over a card, a double-click renames the card, not the link
              // (#165) — unless it is on the link's own label (#202).
              const under = cardUnderLink(event)
              if (under) {
                useEditor.getState().select(under)
                useEditor.getState().setEditing(under)
                return
              }
              void editLinkLabel(edge.source, edge.target)
            }}
            onNodeDoubleClick={(_event, node) => {
              useEditor.getState().select(node.id)
              useEditor.getState().setEditing(node.id)
            }}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onMoveStart={(event) => {
              // event is null for programmatic moves (fitView, setCenter). A pan or
              // zoom by the user leaves the node menu behind, so it closes.
              if (!event) return
              userMovedRef.current = true
              setNodeMenu(null)
            }}
            // Panning or zooming while renaming can move the node off screen (#97).
            onMove={() => {
              if (useEditor.getState().editing) checkRenderAll()
            }}
            onPaneClick={() => {
              // Pane click selects the root instead of clearing the selection (#5): one click
              // anywhere yields a live selection plus document-level shortcuts, so the
              // Tab/Enter/Del chain is reachable in a single click. Clearing the selection
              // was the dead end — it left no node for the shortcuts to act on, and Escape /
              // the details close button / switching projects still deselect.
              if (boxSelect.justSelectedRef.current) return
              if (viewRoot) useEditor.getState().select(viewRoot.id)
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.5}
              color={preset.palette.nodeBorder}
            />
            <Controls position="top-left" showInteractive={false} fitViewOptions={FIT_VIEW_OPTIONS}>
              <ControlButton
                onClick={toggleMinimap}
                title={minimapLabel}
                aria-label={minimapLabel}
                aria-pressed={minimapShown}
                className="minimap-toggle"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect
                    x="1.5"
                    y="3"
                    width="13"
                    height="10"
                    rx="1"
                    fill="none"
                    stroke="currentColor"
                  />
                  <rect x="8" y="8" width="5" height="3.5" fill="currentColor" />
                </svg>
              </ControlButton>
            </Controls>
            {minimapShown && (
              <MiniMap position="bottom-right" pannable zoomable ariaLabel={t('canvas.overview')} />
            )}
            {dropPreview ? (
              <ViewportPortal>
                <div
                  className="map-drop-line"
                  data-testid="map-drop-line"
                  aria-hidden="true"
                  style={{
                    transform: `translate(${dropPreview.line.x}px, ${dropPreview.line.y - 1.5}px)`,
                    width: dropPreview.line.width,
                  }}
                >
                  {dropPreview.flipTo ? (
                    <span className="map-drop-side">
                      {dropPreview.flipTo === 'left' ? t('drop.toLeft') : t('drop.toRight')}
                    </span>
                  ) : null}
                </div>
              </ViewportPortal>
            ) : null}
          </ReactFlow>
          {nodeMenu && menuNode ? (
            <div
              ref={nodeMenuRef}
              className="node-context-menu"
              role="menu"
              aria-label={t('canvas.nodeActions')}
              style={
                nodeMenu.bottom === undefined
                  ? { left: nodeMenu.x, top: nodeMenu.y, maxHeight: nodeMenu.maxHeight }
                  : { left: nodeMenu.x, bottom: nodeMenu.bottom, maxHeight: nodeMenu.maxHeight }
              }
              onKeyDown={(event) => {
                const items = Array.from(
                  nodeMenuRef.current?.querySelectorAll<HTMLButtonElement>(
                    'button[role="menuitem"]:not([disabled])',
                  ) ?? [],
                )
                const active = document.activeElement as HTMLButtonElement | null
                const index = active ? items.indexOf(active) : -1
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  closeNodeMenu()
                } else if (
                  event.key === 'Tab' ||
                  event.key === 'ArrowDown' ||
                  event.key === 'ArrowUp'
                ) {
                  event.preventDefault()
                  event.stopPropagation()
                  const direction = event.key === 'ArrowUp' || event.shiftKey ? -1 : 1
                  const next = (index + direction + items.length) % items.length
                  items[next]?.focus()
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault()
                  event.stopPropagation()
                  items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
                }
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeNodeMenu()
                  useEditor.getState().setEditing(nodeMenu.nodeId)
                }}
              >
                {t('canvas.rename')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = nodeMenu.nodeId
                  closeNodeMenu()
                  if (useEditor.getState().selection !== id) useEditor.getState().select(id)
                  openNotes()
                }}
              >
                {t('canvas.notes')}
              </button>
              {!menuIsMapRoot ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    toggleTaskDone('map', nodeMenu.nodeId)
                  }}
                >
                  {menuNode.data.node.role !== 'task'
                    ? t('canvas.makeTask')
                    : menuNode.data.node.done
                      ? t('canvas.markNotDone')
                      : t('canvas.markDone')}
                </button>
              ) : null}
              {(['color', 'icon'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = nodeMenu.nodeId
                    closeNodeMenu()
                    useUi.getState().setMarkerPicker({ section: 'map', id, kind })
                  }}
                >
                  {kind === 'color' ? t('canvas.color') : t('canvas.marker')}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                data-testid="node-menu-tags"
                onClick={() => {
                  const id = nodeMenu.nodeId
                  closeNodeMenu()
                  useUi.getState().setTagEditor({ section: 'map', ids: [id] })
                }}
              >
                {t('canvas.tags')}
              </button>
              {(menuNode.data.node.image ? IMAGE_MENU : IMAGE_MENU.slice(1, 2)).map(
                ([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    data-testid={`node-menu-${key}-image`}
                    onClick={() => {
                      const id = nodeMenu.nodeId
                      closeNodeMenu()
                      if (key === 'view') useUi.getState().setImageViewer({ section: 'map', id })
                      else
                        void loadImages().then((images) => {
                          if (key === 'add') void images.pickAndAttach({ section: 'map', id })
                          else images.removeImage('map', id)
                        })
                    }}
                  >
                    {t(key === 'add' && menuNode.data.node.image ? 'canvas.replaceImage' : label)}
                  </button>
                ),
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeNodeMenu()
                  addChildFromMenu(nodeMenu.nodeId)
                }}
              >
                {t('canvas.addChild')}
              </button>
              {menuCanAddSibling ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    addSiblingFromMenu(nodeMenu.nodeId)
                  }}
                >
                  {t('canvas.addSibling')}
                </button>
              ) : null}
              {menuHasChildren ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    toggleFold('map', nodeMenu.nodeId)
                  }}
                >
                  {menuNode.data.hiddenCount > 0 ? t('canvas.expand') : t('canvas.collapse')}
                </button>
              ) : null}
              {menuHasChildren && menuNode.data.node.children!.some(hasFoldedBranch) ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    foldBranch('map', nodeMenu.nodeId, true)
                  }}
                >
                  {t('fold.expandBranch')}
                </button>
              ) : null}
              {menuHasChildren && menuNode.data.node.children!.some(hasOpenBranch) ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    foldBranch('map', nodeMenu.nodeId, false)
                  }}
                >
                  {t('fold.collapseBranch')}
                </button>
              ) : null}
              {!menuIsRoot ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    focusOn('map', nodeMenu.nodeId)
                  }}
                >
                  {t('focus.enter')}
                </button>
              ) : null}
              {!menuIsMapRoot ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    deleteSelection(nodeMenu.nodeId)
                  }}
                >
                  {t('canvas.delete')}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="menu-separator-before"
                onClick={() => {
                  closeNodeMenu()
                  void copyFromMenu()
                }}
              >
                {t('clipboard.copy')}
              </button>
              {!menuIsMapRoot ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    void copyFromMenu(true)
                  }}
                >
                  {t('clipboard.cutAction')}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeNodeMenu()
                  void pasteFromMenu('child')
                }}
              >
                {t('clipboard.paste')}
              </button>
              {menuCanAddSibling ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    void pasteFromMenu('sibling')
                  }}
                >
                  {t('clipboard.pasteSibling')}
                </button>
              ) : null}
              {menuCanFlipSide ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const side = menuNode.data.side === 'left' ? 'right' : 'left'
                    closeNodeMenu()
                    useEditor
                      .getState()
                      .applyTree('map', (tree) => setSide(tree, nodeMenu.nodeId, side))
                  }}
                >
                  {t('canvas.flipSide')}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const from = nodeMenu.nodeId
                  closeNodeMenu()
                  useUi.getState().setLinkPickFrom(from)
                }}
              >
                {t('canvas.linkTo')}
              </button>
              {!menuIsMapRoot ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = nodeMenu.nodeId
                    closeNodeMenu()
                    useUi.getState().setBranchExport({ section: 'map', id })
                  }}
                >
                  {t('branch.export')}
                </button>
              ) : null}
              {menuLinkPair ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    if (menuLinkPair.hasLink) removeLinkFromSelection()
                    else addLinkFromSelection()
                  }}
                >
                  {menuLinkPair.hasLink ? t('canvas.removeLink') : t('canvas.addLink')}
                </button>
              ) : null}
              {menuLinkPair?.hasLink ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeNodeMenu()
                    const [first, second] = [...useEditor.getState().selectionSet]
                    void editLinkLabel(first, second)
                  }}
                >
                  {t('canvas.labelLink')}
                </button>
              ) : null}
            </div>
          ) : null}
          {coarse && touchNode && !editing && !nodeMenu ? (
            <TouchActionBar
              title={touchNode.data.node.title}
              isRoot={touchNode.data.isRoot}
              hasChildren={touchNode.data.hasChildren}
              collapsed={touchNode.data.hiddenCount > 0}
              onAddChild={() => addChildFromMenu(touchNode.id)}
              onAddSibling={() => addSiblingFromMenu(touchNode.id)}
              onRename={() => useEditor.getState().setEditing(touchNode.id)}
              onNotes={openNotes}
              onDelete={() => deleteSelection(touchNode.id)}
              onToggleFold={() => toggleFold('map', touchNode.id)}
              onMore={(x, y) => openNodeMenu(touchNode.id, x, y)}
            />
          ) : null}
          <p className="canvas-hint" id={hintId}>
            {HINTS.map(([key, action], index) => (
              <Fragment key={key}>
                {index > 0 ? ' · ' : ''}
                <kbd>{keyLabel(key)}</kbd> {t(action)}
              </Fragment>
            ))}{' '}
            <button
              type="button"
              className="canvas-hint-help"
              aria-label={t('canvas.shortcuts')}
              title={t('canvas.shortcutsTitle')}
              onClick={() => useUi.getState().setShortcutsOpen(true)}
            >
              ?
            </button>
          </p>
        </div>
      </NodeGestureContext.Provider>
    </OwnerFocusContext.Provider>
  )
}
