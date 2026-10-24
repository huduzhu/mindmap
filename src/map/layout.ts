import { mindmap } from '@antv/hierarchy'
import type { Edge, Node } from '@xyflow/react'
import type { NodeLink, Preset, TreeNode } from '../schema/types'
import { measureText, wrapLines, type MeasureText } from './measure'
import { resolveNodeStyle } from './nodeStyle'
import { isTask, taskProgress } from './marks'
import { thumbSize } from './image'

export interface MapNodeData extends Record<string, unknown> {
  node: TreeNode
  preset: Preset
  isRoot: boolean
  side: 'left' | 'right'
  branchColor: string
  editing: boolean
  hasChildren: boolean
  hiddenCount: number
  hasNotes: boolean
  /** 0 for the root (#85: spoken as "level N"). */
  depth: number
  /** Tag filter matches hidden inside this folded node ("+2 tagged", #150). */
  tagHits?: number | undefined
}

export interface MapEdgeData extends Record<string, unknown> {
  side: 'left' | 'right'
  curve: Preset['edges']['curve']
}

/** A cross-link's label pill (#148c), in the preset's colours. */
export interface LinkEdgeData extends Record<string, unknown> {
  from: string
  to: string
  labelText: string
  labelFill: string
  labelBorder: string
  /** Bow away from the centre: down for a link below the central topic (#165). */
  bow?: 'up' | 'down'
}

export interface MapLayout {
  nodes: Node<MapNodeData>[]
  edges: Edge[]
}

const H_GAP = 36
const V_GAP = 8
const MAX_WIDTH = 360
const MIN_WIDTH = 72
// Matches `.map-node { padding: 6px 12px; border: 1.5px; line-height: 1.35 }` —
// keep these in sync with src/App.css and src/map/nodeStyle.ts.
const NODE_PADDING_X = 24
const NODE_PADDING_Y = 12
const NODE_BORDER = 3
export const NODE_LINE_HEIGHT = 1.35
// Canvas and DOM text layout can differ by a subpixel per line; never size
// the box tighter than the browser will render it.
const SAFETY_PX = 2
export const MAX_LINE_COUNT = 8
// The marks around a title (#148), matching src/components/nodeMarks.css: a
// 14px box with a 6px gap; an emoji (at least 1.25em, it often renders wider
// than the canvas measures it) with a 4px gap. The progress chip sits under
// the title, so a parent with tasks grows taller, never wider (a wider parent
// would push its whole branch outwards): 0.75em text at line height 1.35
// with a 1px border, and 5px padding on the sides.
const CHECK_PX = 20
const ICON_MIN_EM = 1.25
const ICON_GAP_PX = 4
const CHIP_SCALE = 0.75
const CHIP_BORDER_PX = 2
const CHIP_PADDING_X = 10
// Tag chips (#150), matching .node-tag in src/components/nodeMarks.css: 0.7em
// text at line height 1.35, a 1px border, 4px padding on the sides, 3px
// between chips and above the row. At most three chips, then "+N".
const TAG_SCALE = 0.7
const TAG_CHROME_X = 10
const TAG_GAP = 3
export const MAX_MAP_TAGS = 3
// An image (#149) sits above the title at its thumbnail size (at most 220 px
// wide, aspect kept), with this gap under it, matching .map-node-image in
// src/App.css. The size comes from the node's w/h, so nothing moves when the
// picture itself arrives.
export const IMAGE_GAP = 4

/** The row of tag chips under the title: its height and the width it needs. */
function tagRowSize(
  node: TreeNode,
  preset: Preset,
  fontSize: number,
  measure: MeasureText,
): { width: number; height: number } | null {
  const tags = node.tags
  if (!tags || tags.length === 0) return null
  const font = `normal ${fontSize * TAG_SCALE}px ${preset.font.family}`
  const labels = tags.slice(0, MAX_MAP_TAGS).map((tag) => `#${tag}`)
  if (tags.length > MAX_MAP_TAGS) labels.push(`+${tags.length - MAX_MAP_TAGS}`)
  let width = 0
  for (const label of labels) width += Math.ceil(measure(label, font)) + TAG_CHROME_X + TAG_GAP
  return {
    width: width - TAG_GAP,
    height: fontSize * TAG_SCALE * NODE_LINE_HEIGHT + 2 + TAG_GAP,
  }
}

/** Width the marks beside the title take, so wrapping leaves room for them. */
function marksWidth(
  node: TreeNode,
  preset: Preset,
  fontSize: number,
  measure: MeasureText,
): number {
  let width = isTask(node) ? CHECK_PX : 0
  if (node.icon) {
    const iconFont = `normal ${fontSize}px ${preset.font.family}`
    width += Math.ceil(Math.max(measure(node.icon, iconFont), fontSize * ICON_MIN_EM)) + ICON_GAP_PX
  }
  return width
}

/** The chip under the title: its height, and the width it needs (#148a). */
function chipSize(
  node: TreeNode,
  preset: Preset,
  fontSize: number,
  measure: MeasureText,
): { width: number; height: number } | null {
  const progress = taskProgress(node)
  if (!progress) return null
  const chipFont = `normal ${fontSize * CHIP_SCALE}px ${preset.font.family}`
  const text = Math.ceil(measure(`${progress.done}/${progress.total}`, chipFont))
  return {
    width: text + CHIP_PADDING_X + CHIP_BORDER_PX,
    height: fontSize * CHIP_SCALE * NODE_LINE_HEIGHT + CHIP_BORDER_PX,
  }
}

/** The CSS font shorthand a node renders its title with (see nodeStyle.ts). */
export function nodeFont(node: TreeNode, preset: Preset, isRoot: boolean): string {
  const style = resolveNodeStyle(preset, node, isRoot)
  return `${style.fontWeight ?? 'normal'} ${style.fontSize}px ${preset.font.family}`
}

/**
 * Box size for a node, from the measured width of its wrapped title (#72).
 * Lines break like the CSS does (at spaces, between CJK characters, inside a
 * word only when it cannot fit), so the box always holds the rendered text.
 */
export function nodeSize(
  node: TreeNode,
  preset: Preset,
  isRoot: boolean,
  measure: MeasureText = measureText,
): { width: number; height: number } {
  const font = nodeFont(node, preset, isRoot)
  const fontSize = preset.font.baseSize * (isRoot ? (preset.font.titleScale ?? 1) : 1)
  const chrome =
    NODE_PADDING_X + NODE_BORDER + SAFETY_PX + marksWidth(node, preset, fontSize, measure)
  const lines = wrapLines(node.title || ' ', MAX_WIDTH - chrome, font, measure)
  const lineCount = Math.min(MAX_LINE_COUNT, lines.length)
  const widest = Math.max(...lines.map((line) => measure(line, font)))
  const chip = chipSize(node, preset, fontSize, measure)
  const tagRow = tagRowSize(node, preset, fontSize, measure)
  const thumb = node.image ? thumbSize(node.image) : null
  const content = Math.max(
    widest + chrome,
    (chip?.width ?? 0) + NODE_PADDING_X + NODE_BORDER,
    (tagRow?.width ?? 0) + NODE_PADDING_X + NODE_BORDER + SAFETY_PX,
    (thumb?.width ?? 0) + NODE_PADDING_X + NODE_BORDER,
  )
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.ceil(content)))
  const height =
    lineCount * fontSize * NODE_LINE_HEIGHT +
    NODE_PADDING_Y +
    NODE_BORDER +
    (chip?.height ?? 0) +
    (tagRow?.height ?? 0) +
    (thumb ? thumb.height + IMAGE_GAP : 0)
  return { width, height }
}

interface LayoutDatum {
  id: string
  node: TreeNode
  children: LayoutDatum[]
}

function toLayoutData(node: TreeNode): LayoutDatum {
  return {
    id: node.id,
    node,
    children: node.collapsed ? [] : (node.children ?? []).map(toLayoutData),
  }
}

function countHidden(node: TreeNode): number {
  return (node.children ?? []).reduce((sum, c) => sum + 1 + countHidden(c), 0)
}

/**
 * The side of the map a main branch is laid out on: its own `side`, or the
 * first half (rounded up) on the right and the rest on the left. Each side
 * lists its branches top to bottom in tree order.
 */
export function mainBranchSide(node: TreeNode, index: number, count: number): 'left' | 'right' {
  if (node.side === 'left' || node.side === 'right') return node.side
  return index < Math.ceil(count / 2) ? 'right' : 'left'
}

export function edgeType(curve: Preset['edges']['curve']): Edge['type'] {
  void curve
  return 'mapEdge'
}

/**
 * Which sides a cross-link leaves and enters by: the facing sides when one
 * node is clear of the other horizontally, otherwise (nodes stacked above one
 * another) both on the outer side of the source's branch, so the arc loops
 * outwards instead of crossing the nodes.
 */
export function linkHandles(
  from: Pick<Node<MapNodeData>, 'position' | 'width' | 'data'>,
  to: Pick<Node<MapNodeData>, 'position' | 'width' | 'data'>,
): { sourceHandle: string; targetHandle: string } {
  const fromLeft = from.position.x
  const fromRight = fromLeft + (from.width ?? 0)
  const toLeft = to.position.x
  const toRight = toLeft + (to.width ?? 0)
  if (toLeft >= fromRight) return { sourceHandle: 'source-right', targetHandle: 'target-left' }
  if (toRight <= fromLeft) return { sourceHandle: 'source-left', targetHandle: 'target-right' }
  const side = from.data.side === 'left' ? 'left' : 'right'
  return { sourceHandle: `source-${side}`, targetHandle: `target-${side}` }
}

export function layoutMap(
  root: TreeNode,
  preset: Preset,
  selectedId: string | null,
  editingId: string | null,
  selectedIds?: ReadonlySet<string>,
  links?: NodeLink[],
): MapLayout {
  return decorateLayout(layoutGeometry(root, preset, links), selectedId, editingId, selectedIds)
}

/**
 * Apply selection and editing flags to a geometry-only layout. Cheap, and it
 * reuses every node object whose flags did not change, so React Flow's
 * memoization holds across selection changes (#64).
 */
export function decorateLayout(
  layout: MapLayout,
  selectedId: string | null,
  editingId: string | null,
  selectedIds?: ReadonlySet<string>,
): MapLayout {
  const nodes = layout.nodes.map((node) => {
    const selected = selectedIds ? selectedIds.has(node.id) : node.id === selectedId
    const editing = node.id === editingId
    if (node.selected === selected && node.data.editing === editing) return node
    return {
      ...node,
      selected,
      data: node.data.editing === editing ? node.data : { ...node.data, editing },
    }
  })
  return { nodes, edges: layout.edges }
}

type SizeCache = WeakMap<TreeNode, { isRoot: boolean; size: { width: number; height: number } }>
const sizeCaches = new WeakMap<Preset, SizeCache>()

function sizeCacheFor(preset: Preset): SizeCache {
  let cache = sizeCaches.get(preset)
  if (!cache) {
    cache = new WeakMap()
    sizeCaches.set(preset, cache)
  }
  return cache
}

function sameNodeData(a: MapNodeData, b: MapNodeData): boolean {
  return (
    a.node === b.node &&
    a.preset === b.preset &&
    a.isRoot === b.isRoot &&
    a.side === b.side &&
    a.branchColor === b.branchColor &&
    a.editing === b.editing &&
    a.hasChildren === b.hasChildren &&
    a.hiddenCount === b.hiddenCount &&
    a.hasNotes === b.hasNotes &&
    a.depth === b.depth
  )
}

function sameNode(a: Node<MapNodeData>, b: Node<MapNodeData>): boolean {
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.draggable === b.draggable &&
    a.selected === b.selected &&
    sameNodeData(a.data, b.data)
  )
}

function sameEdge(a: Edge, b: Edge): boolean {
  const aData = a.data as Partial<MapEdgeData> | undefined
  const bData = b.data as Partial<MapEdgeData> | undefined
  return (
    a.source === b.source &&
    a.target === b.target &&
    a.type === b.type &&
    a.sourceHandle === b.sourceHandle &&
    a.targetHandle === b.targetHandle &&
    aData?.side === bData?.side &&
    aData?.curve === bData?.curve &&
    a.label === b.label &&
    a.data?.labelText === b.data?.labelText &&
    a.data?.labelFill === b.data?.labelFill &&
    a.data?.labelBorder === b.data?.labelBorder &&
    // A link's bow follows its ends across the centre line (#197).
    a.data?.bow === b.data?.bow &&
    a.interactionWidth === b.interactionWidth &&
    a.zIndex === b.zIndex &&
    a.style?.stroke === b.style?.stroke &&
    a.style?.strokeWidth === b.style?.strokeWidth &&
    a.style?.strokeDasharray === b.style?.strokeDasharray
  )
}

/**
 * Hand back the previous layout's node and edge objects wherever nothing about
 * them changed (#140). An edit copies only the path to the change, so most of
 * a big map keeps its place, size and data; reusing those objects lets React
 * Flow skip re-adopting them instead of rebuilding every node on each edit.
 */
function reuseUnchanged(next: MapLayout, previous: MapLayout | undefined): MapLayout {
  if (!previous || previous.nodes.length === 0) return next
  const oldNodes = new Map(previous.nodes.map((node) => [node.id, node]))
  const oldEdges = new Map(previous.edges.map((edge) => [edge.id, edge]))
  const nodes = next.nodes.map((node) => {
    const old = oldNodes.get(node.id)
    return old && sameNode(old, node) ? old : node
  })
  const edges = next.edges.map((edge) => {
    const old = oldEdges.get(edge.id)
    return old && sameEdge(old, edge) ? old : edge
  })
  return { nodes, edges }
}

/**
 * The expensive part: sizes and the @antv/hierarchy pass. Depends only on the
 * tree, the preset and the links — never on selection — so the canvas can
 * memoize it separately (#64). Pass the previous result as `previous` to get
 * its objects back for every node and edge that did not change (#140).
 */
export function layoutGeometry(
  root: TreeNode,
  preset: Preset,
  links?: NodeLink[],
  previous?: MapLayout,
): MapLayout {
  return reuseUnchanged(computeGeometry(root, preset, links), previous)
}

function computeGeometry(root: TreeNode, preset: Preset, links?: NodeLink[]): MapLayout {
  const datum = toLayoutData(root)
  const sizes = new Map<string, { width: number; height: number }>()
  const cached = sizeCacheFor(preset)
  const collectSizes = (d: LayoutDatum, isRoot: boolean) => {
    // Tree edits copy only the path to the change, so every other node keeps
    // its object and its measured size (#97).
    let hit = cached.get(d.node)
    if (!hit || hit.isRoot !== isRoot) {
      hit = { isRoot, size: nodeSize(d.node, preset, isRoot) }
      cached.set(d.node, hit)
    }
    sizes.set(d.id, hit.size)
    d.children.forEach((child) => collectSizes(child, false))
  }
  collectSizes(datum, true)

  const rootChildCount = datum.children.length
  const result = mindmap(datum, {
    direction: 'H',
    getId: (d) => (d as LayoutDatum).id,
    getWidth: (d) => sizes.get((d as LayoutDatum).id)?.width ?? MIN_WIDTH,
    getHeight: (d) => sizes.get((d as LayoutDatum).id)?.height ?? 30,
    getHGap: () => H_GAP,
    getVGap: () => V_GAP,
    getSide: (child, index) =>
      mainBranchSide((child.data as unknown as LayoutDatum).node, index, rootChildCount),
  })

  const branchColors = preset.palette.branchColors
  const branchOf = new Map<string, string>()
  const nodes: Node<MapNodeData>[] = []
  const edges: Edge[] = []
  const type = edgeType(preset.edges.curve)

  result.eachNode((h) => {
    const data = h.data as unknown as LayoutDatum
    const treeNode = data.node
    const { width, height } = sizes.get(treeNode.id)!
    const isRoot = h.depth === 0

    let branchColor: string
    if (isRoot) {
      branchColor = preset.palette.edge
    } else if (h.depth === 1) {
      const index = result.children.indexOf(h)
      branchColor =
        branchColors[((index % branchColors.length) + branchColors.length) % branchColors.length] ??
        preset.palette.edge
      branchOf.set(treeNode.id, branchColor)
    } else {
      const parentDatum = h.parent!.data as unknown as LayoutDatum
      branchColor = branchOf.get(parentDatum.id) ?? preset.palette.edge
      branchOf.set(treeNode.id, branchColor)
    }

    const side = h.side ?? 'right'
    nodes.push({
      id: treeNode.id,
      type: 'mapNode',
      position: { x: h.x + h.hgap, y: h.y - height / 2 },
      width,
      height,
      measured: { width, height },
      selected: false,
      draggable: !isRoot,
      connectable: false,
      data: {
        node: treeNode,
        preset,
        isRoot,
        side,
        branchColor,
        editing: false,
        hasChildren: (treeNode.children?.length ?? 0) > 0,
        hiddenCount: treeNode.collapsed ? countHidden(treeNode) : 0,
        hasNotes: Boolean(treeNode.notes && treeNode.notes.length > 0),
        depth: h.depth,
      },
    })

    if (!isRoot) {
      const parentId = (h.parent!.data as unknown as LayoutDatum).id
      edges.push({
        id: `${parentId}->${treeNode.id}`,
        source: parentId,
        target: treeNode.id,
        type,
        data: { side, curve: preset.edges.curve },
        sourceHandle: side === 'right' ? 'source-right' : 'source-left',
        targetHandle: side === 'right' ? 'target-left' : 'target-right',
        style: {
          stroke: branchColor,
          strokeWidth: preset.edges.width,
          strokeDasharray: preset.edges.dashed ? '6 4' : undefined,
        },
      })
    }
  })

  const placed = new Map(nodes.map((node) => [node.id, node]))
  const centre = nodes.find((node) => node.data.isRoot)
  const centreY = centre ? centre.position.y + (centre.height ?? 0) / 2 : 0
  const middleY = (node: Node<MapNodeData>) => node.position.y + (node.height ?? 0) / 2
  for (const link of links ?? []) {
    const from = placed.get(link.from)
    const to = placed.get(link.to)
    if (!from || !to || link.from === link.to) continue
    edges.push({
      id: `link:${link.from}->${link.to}`,
      source: link.from,
      target: link.to,
      type: 'linkEdge',
      ...linkHandles(from, to),
      // Above the nodes, so a link is not lost behind the cards it passes
      // (live test, item 3). A narrow hit area (#165): clicks and double-clicks
      // that land on a card behind the line go to the card (MindMapCanvas).
      zIndex: 1,
      interactionWidth: 8,
      ...(link.label ? { label: link.label } : {}),
      data: {
        from: link.from,
        to: link.to,
        labelText: preset.palette.text,
        labelFill: preset.palette.nodeFill,
        labelBorder: preset.palette.mutedText,
        bow: (middleY(from) + middleY(to)) / 2 > centreY ? 'down' : 'up',
      } satisfies LinkEdgeData,
      style: {
        stroke: preset.palette.mutedText,
        strokeWidth: Math.max(1, preset.edges.width),
        strokeDasharray: '6 4',
      },
    })
  }

  return { nodes, edges }
}
