import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { applyCollapsed } from './applyCollapsed'
import { IMAGE_GAP, layoutMap, MAX_MAP_TAGS, type MapNodeData } from '../map/layout'
import { thumbSize } from '../map/image'
import { resolveNodeStyle } from '../map/nodeStyle'
import { renderNotesMarkdown } from '../notesMarkdown'
import type { NodeImage, Preset, Project, TreeNode } from '../schema/types'
import './viewer.css'
import '../present/present.css'
import { viewerLocale, viewerText, type ViewerKey, type ViewerLocale } from './strings'
import { LinkEdge } from '../components/LinkEdge'
import { MapEdge } from '../components/MapEdge'
import { NodeIcon, NodeTags, ProgressChip, TaskCheck } from '../components/NodeMarks'
import { applyTagFilter, countNodeTags } from '../map/tagFilter'
import { isDone, isTask, taskProgress } from '../map/marks'
import { PresentStage } from '../present/PresentStage'
import type { PresentText } from '../present/steps'

export interface ViewerData {
  project: Project
  preset: Preset
  /** The app's language when the file was exported (#99); English if absent. */
  locale?: string
  /** The map's pictures as data URIs by asset hash (#149). */
  images?: Record<string, string>
}

declare global {
  interface Window {
    __MMS_DATA__?: ViewerData
  }
}

interface ViewerNodeData extends MapNodeData {
  dimmed: boolean
  highlight: boolean
  /** On the path to a node with the picked tag (#150): 60%. */
  onPath?: boolean
}

const LocaleContext = createContext<ViewerLocale>('en')
const ImagesContext = createContext<Record<string, string>>({})

/**
 * A node's picture (#149) at its map size, from the data URI the export
 * embedded; `zoomable` marks it as the click target that shows it larger.
 */
function ViewerImage({ image, zoomable }: { image: NodeImage; zoomable?: boolean }) {
  const locale = useContext(LocaleContext)
  const url = useContext(ImagesContext)[image.asset]
  const { width, height } = thumbSize(image)
  return (
    <span
      className={`node-thumb map-node-image${url ? '' : ' node-thumb-empty'}${url && zoomable ? ' node-thumb-open' : ''}`}
      style={{ width, height }}
      title={url && zoomable ? viewerText(locale, 'enlarge') : undefined}
      data-testid="viewer-image"
    >
      {url ? (
        <img src={url} alt={image.alt ?? ''} draggable={false} width={width} height={height} />
      ) : (
        <span className="node-thumb-missing">{viewerText(locale, 'imageMissing')}</span>
      )}
    </span>
  )
}

const renderPresentImage = (image: NodeImage) => <ViewerImage image={image} />

function ViewerNode({ data }: NodeProps<Node<ViewerNodeData>>) {
  const locale = useContext(LocaleContext)
  const preset = data.preset as Preset
  const style = resolveNodeStyle(preset, data.node, data.isRoot)
  if (data.dimmed) style.opacity = 0.3
  else if (data.onPath) style.opacity = 0.6
  if (data.highlight)
    style.outline = `3px solid ${preset.palette.branchColors[1] ?? preset.palette.edge}`
  const node = data.node
  // The picture sits above the title, in the room the layout made for it.
  if (node.image) style.paddingTop = 6 + thumbSize(node.image).height + IMAGE_GAP
  const done = isDone(node)
  const progress = taskProgress(node)

  return (
    <div
      className={`map-node viewer-node${data.hiddenCount > 0 ? ' map-node-collapsed' : ''}${done ? ' map-node-done' : ''}${progress ? ' map-node-has-progress' : ''}${node.tags?.length ? ' map-node-has-tags' : ''}`}
      style={style}
      data-side={data.side}
    >
      <Handle type="source" position={Position.Right} id="source-right" className="map-handle" />
      <Handle type="source" position={Position.Left} id="source-left" className="map-handle" />
      <Handle type="target" position={Position.Left} id="target-left" className="map-handle" />
      <Handle type="target" position={Position.Right} id="target-right" className="map-handle" />
      {isTask(node) ? (
        <TaskCheck
          done={done}
          label={viewerText(locale, done ? 'done' : 'notDone', { title: node.title })}
        />
      ) : null}
      {node.image ? <ViewerImage image={node.image} zoomable /> : null}
      {node.icon ? <NodeIcon icon={node.icon} /> : null}
      <span className="map-node-title" title={node.title.length > 120 ? node.title : undefined}>
        {node.title || ' '}
      </span>
      {progress ? (
        <ProgressChip
          progress={progress}
          title={viewerText(locale, 'progress', { ...progress })}
          className="map-node-progress"
        />
      ) : null}
      <NodeTags
        tags={node.tags}
        colors={preset.palette.branchColors}
        max={MAX_MAP_TAGS}
        className="map-node-tags"
      />
      {data.hasChildren && (
        <button
          type="button"
          className={`map-node-toggle map-node-toggle-${data.side}`}
          data-testid="viewer-toggle"
          title={
            data.hiddenCount > 0
              ? viewerText(locale, 'expand', { count: data.hiddenCount })
              : viewerText(locale, 'collapse')
          }
        >
          {data.hiddenCount > 0 ? `${data.hiddenCount}` : '−'}
        </button>
      )}
    </div>
  )
}

const nodeTypes = { mapNode: ViewerNode }
const edgeTypes = { mapEdge: MapEdge, linkEdge: LinkEdge }

export function ViewerApp({ data }: { data: ViewerData }) {
  const { project, preset } = data
  const locale = viewerLocale(data.locale)
  const text = (key: ViewerKey) => viewerText(locale, key)
  const [collapsedOverrides, setCollapsedOverrides] = useState<Map<string, boolean>>(new Map())
  const [query, setQuery] = useState('')
  // A read-only tag filter (#150): highlight the nodes with the picked tag.
  const [tagPick, setTagPick] = useState<string | null>(null)
  const projectTags = useMemo(() => countNodeTags(project.map), [project.map])
  const [notesNodeId, setNotesNodeId] = useState<string | null>(null)
  // The picture shown larger (#149).
  const [enlarged, setEnlarged] = useState<TreeNode | null>(null)
  const images = data.images ?? {}
  // Presentation mode (#152, decision HA-D3): the same steps as the app.
  const [presenting, setPresenting] = useState(false)
  const presentText: PresentText = (key, params) => viewerText(locale, `present.${key}`, params)

  // F5 presents here too, instead of reloading the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEnlarged(null)
      if (event.key !== 'F5' || event.ctrlKey || event.metaKey || event.altKey) return
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea')) return
      event.preventDefault()
      setPresenting(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const tree = useMemo(
    () => applyCollapsed(project.map, collapsedOverrides),
    [project.map, collapsedOverrides],
  )
  const { nodes, edges } = useMemo(
    () => layoutMap(tree, preset, null, null, undefined, project.links),
    [tree, preset, project.links],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const tagStates = useMemo(
    () => (tagPick ? applyTagFilter(tree, { tags: [tagPick], all: false, hide: false }) : null),
    [tree, tagPick],
  )
  const annotated = useMemo(() => {
    if (!normalizedQuery && !tagStates) return nodes as Node<ViewerNodeData>[]
    return nodes.map((node) => {
      const found = !normalizedQuery || node.data.node.title.toLowerCase().includes(normalizedQuery)
      const state = tagStates?.states.get(node.id)
      const matches = found && state !== 'dim' && state !== 'path'
      return {
        ...node,
        data: {
          ...node.data,
          dimmed: !found || state === 'dim',
          onPath: state === 'path',
          highlight: matches && Boolean(normalizedQuery),
        },
      } as Node<ViewerNodeData>
    })
  }, [nodes, normalizedQuery, tagStates])

  const notesNode = useMemo(() => {
    if (!notesNodeId) return null
    const found = nodes.find((node) => node.id === notesNodeId)
    return found?.data.node.notes ? found.data.node : null
  }, [notesNodeId, nodes])

  const onNodeClick = (event: React.MouseEvent, node: Node<ViewerNodeData>) => {
    const target = event.target as HTMLElement
    if (target.closest('.map-node-toggle')) {
      toggle(node.id)
      return
    }
    if (target.closest('.node-thumb-open') && node.data.node.image) {
      setEnlarged(node.data.node)
      return
    }
    if (node.data.node.notes) {
      setNotesNodeId(node.id)
      return
    }
    if (node.data.hasChildren) toggle(node.id)
  }

  const toggle = (id: string) => {
    setCollapsedOverrides((prev) => {
      const next = new Map(prev)
      const locate = (node: TreeNode): TreeNode | null => {
        if (node.id === id) return node
        for (const child of node.children ?? []) {
          const found = locate(child)
          if (found) return found
        }
        return null
      }
      const target = locate(project.map)
      const current = next.get(id) ?? target?.collapsed ?? false
      next.set(id, !current)
      return next
    })
  }

  return (
    <LocaleContext.Provider value={locale}>
      <ImagesContext.Provider value={images}>
        <div className="mms-viewer" style={{ background: preset.palette.background }}>
          <div className="mms-viewer-bar" style={{ color: preset.palette.text }}>
            <strong className="mms-viewer-title">{project.name}</strong>
            <input
              className="mms-viewer-search"
              type="search"
              placeholder={text('search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={text('searchLabel')}
            />
            {projectTags.length > 0 ? (
              <select
                className="mms-viewer-tags"
                aria-label={text('tags')}
                title={text('tags')}
                value={tagPick ?? ''}
                onChange={(e) => setTagPick(e.target.value || null)}
                data-testid="viewer-tags"
              >
                <option value="">{text('tagsAll')}</option>
                {projectTags.map(([tag, count]) => (
                  <option key={tag} value={tag}>
                    #{tag} ({count})
                  </option>
                ))}
              </select>
            ) : null}
            <span className="mms-viewer-hint">{text('hint')}</span>
            <button
              type="button"
              className="mms-viewer-present"
              title={text('presentTitle')}
              data-testid="viewer-present"
              onClick={() => setPresenting(true)}
            >
              ▶ {text('present')}
            </button>
          </div>
          <div className="mms-viewer-canvas">
            <ReactFlow
              nodes={annotated}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2.5}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              onlyRenderVisibleElements
              onNodeClick={onNodeClick}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.5}
                color={preset.palette.nodeBorder}
              />
            </ReactFlow>
            {notesNode && (
              <div className="mms-notes-card" role="dialog" aria-label={text('notes')}>
                <div className="mms-notes-head">
                  <strong>{notesNode.title}</strong>
                  <button
                    type="button"
                    onClick={() => setNotesNodeId(null)}
                    aria-label={text('closeNotes')}
                  >
                    ×
                  </button>
                </div>
                <div
                  className="mms-notes-content"
                  dangerouslySetInnerHTML={{ __html: renderNotesMarkdown(notesNode.notes ?? '') }}
                />
              </div>
            )}
          </div>
          {presenting ? (
            <PresentStage
              root={project.map}
              preset={preset}
              links={project.links}
              text={presentText}
              renderImage={renderPresentImage}
              onExit={() => setPresenting(false)}
            />
          ) : null}
          {enlarged?.image && images[enlarged.image.asset] ? (
            <div
              className="mms-image-view"
              role="dialog"
              aria-modal="true"
              aria-label={viewerText(locale, 'imageView', { title: enlarged.title })}
              data-testid="viewer-image-view"
              onClick={() => setEnlarged(null)}
            >
              <img src={images[enlarged.image.asset]} alt={enlarged.image.alt ?? ''} />
              <button
                type="button"
                className="mms-image-close"
                aria-label={text('closeImage')}
                title={text('closeImage')}
                autoFocus
                onClick={() => setEnlarged(null)}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      </ImagesContext.Provider>
    </LocaleContext.Provider>
  )
}
