import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { IMAGE_GAP, layoutGeometry, MAX_MAP_TAGS, type MapNodeData } from '../map/layout'
import { thumbSize } from '../map/image'
import { withClassName } from '../map/className'
import { resolveNodeStyle } from '../map/nodeStyle'
import { isDone, isTask, taskProgress } from '../map/marks'
import { NodeIcon, NodeTags, ProgressChip, TaskCheck } from '../components/NodeMarks'
import { MapEdge } from '../components/MapEdge'
import { LinkEdge } from '../components/LinkEdge'
import type { NodeImage, NodeLink, Preset, TreeNode } from '../schema/types'
import {
  initialPresentState,
  presentationSteps,
  presentKeyAction,
  presentReducer,
  stepAnnouncement,
  stepOf,
  stepView,
  unfoldAll,
  type PresentText,
} from './steps'
import { prefersReducedMotion } from '../a11y/motion'

/**
 * Presentation mode (#152): the map one step at a time, full screen and read
 * only. Shared by the app (as a lazy chunk) and the HTML export's viewer, so
 * it takes its words, its announcer and its exit as props. Its styles are
 * present.css, which each host loads up front (CSS only, no script). Everything it
 * changes — unfolding, dimming, the camera — lives here and is thrown away
 * when it closes; the project, the editor and their history never see it.
 */
export interface PresentStageProps {
  /** The tree to present: the whole map, or the focused branch (#146). */
  root: TreeNode
  preset: Preset
  links?: NodeLink[] | undefined
  /** Start at this node ("Present from here"); the central topic otherwise. */
  startId?: string | null
  text: PresentText
  /**
   * Draws a node's picture (#149) above its title: the app shows the stored
   * thumbnail; without it the space stays empty.
   */
  renderImage?: (image: NodeImage) => ReactNode
  /** Say each step through the host's live region; without it the stage has its own. */
  announce?: (message: string) => void
  onExit: () => void
}

const TextContext = createContext<PresentText>((key) => key)
const ImageContext = createContext<PresentStageProps['renderImage']>(undefined)

const PresentNode = memo(function PresentNode({ data }: NodeProps<Node<MapNodeData>>) {
  const text = useContext(TextContext)
  const renderImage = useContext(ImageContext)
  const preset = data.preset as Preset
  const node = data.node
  const style = resolveNodeStyle(preset, node, data.isRoot)
  const done = isDone(node)
  const progress = taskProgress(node)
  return (
    <div
      className={`map-node${data.isRoot ? ' map-node-root' : ''}${done ? ' map-node-done' : ''}${progress ? ' map-node-has-progress' : ''}${node.tags?.length ? ' map-node-has-tags' : ''}`}
      style={
        node.image ? { ...style, paddingTop: 6 + thumbSize(node.image).height + IMAGE_GAP } : style
      }
      data-side={data.side}
      data-color={node.color}
    >
      <Handle type="source" position={Position.Right} id="source-right" className="map-handle" />
      <Handle type="source" position={Position.Left} id="source-left" className="map-handle" />
      <Handle type="target" position={Position.Left} id="target-left" className="map-handle" />
      <Handle type="target" position={Position.Right} id="target-right" className="map-handle" />
      {node.image && renderImage ? renderImage(node.image) : null}
      {isTask(node) ? (
        <TaskCheck done={done} label={text(done ? 'done' : 'notDone', { title: node.title })} />
      ) : null}
      {node.icon ? <NodeIcon icon={node.icon} hidden /> : null}
      <span className="map-node-title">{node.title || ' '}</span>
      {progress ? (
        <ProgressChip
          progress={progress}
          title={text('tasks', { ...progress })}
          className="map-node-progress"
        />
      ) : null}
      <NodeTags
        tags={node.tags}
        colors={preset.palette.branchColors}
        max={MAX_MAP_TAGS}
        className="map-node-tags"
      />
    </div>
  )
})

const nodeTypes = { mapNode: PresentNode }
const edgeTypes = { mapEdge: MapEdge, linkEdge: LinkEdge }
// The stage's map is hidden from screen readers (each step is announced
// instead), so React Flow's own English descriptions are left empty.
const SILENT_ARIA = {
  'node.a11yDescription.default': '',
  'node.a11yDescription.keyboardDisabled': '',
  'edge.a11yDescription.default': '',
}
const DIMMED = 0.3
const CAMERA_MS = 400
const HUD_MS = 2000
const SWIPE_PX = 50

export function PresentStage(props: PresentStageProps) {
  return (
    <ReactFlowProvider>
      <TextContext.Provider value={props.text}>
        <ImageContext.Provider value={props.renderImage}>
          <Stage {...props} />
        </ImageContext.Provider>
      </TextContext.Provider>
    </ReactFlowProvider>
  )
}

function Stage({ root, preset, links, startId, text, announce, onExit }: PresentStageProps) {
  const flow = useReactFlow()
  const stageRef = useRef<HTMLDivElement>(null)
  const touchRef = useRef<{ x: number; y: number; at: number; fingers: number } | null>(null)
  const onExitRef = useRef(onExit)
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState(0)

  // Folded branches open for the show only (HA2).
  const tree = useMemo(() => unfoldAll(root), [root])
  const steps = useMemo(() => presentationSteps(tree), [tree])
  const layout = useMemo(() => layoutGeometry(tree, preset, links), [tree, preset, links])
  const byId = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout])
  const [state, dispatch] = useReducer(presentReducer, undefined, () =>
    initialPresentState(stepOf(steps, startId), steps.length),
  )
  const view = useMemo(() => stepView(steps, state.index), [steps, state.index])
  const current = byId.get(view.current)?.data.node
  const parentStep = steps[view.index]?.parent
  const parentTitle = parentStep ? (byId.get(parentStep)?.data.node.title ?? null) : null
  const notes = current?.notes?.trim() ? current.notes.trim() : null
  const spoken = current
    ? stepAnnouncement(
        text,
        view.index,
        steps.length,
        current.title,
        parentTitle,
        state.captions ? notes : null,
      )
    : ''

  const currentId = view.current
  const nodes = useMemo(
    () =>
      layout.nodes.map((node) => ({
        ...withClassName(node, node.id === currentId ? 'present-current' : undefined),
        draggable: false,
        selectable: false,
        focusable: false,
        hidden: !view.revealed.has(node.id),
        style: { opacity: view.lit.has(node.id) ? 1 : DIMMED },
      })),
    [layout, view, currentId],
  )
  const edges = useMemo(
    () =>
      layout.edges.map((edge): Edge => ({
        ...edge,
        focusable: false,
        selectable: false,
        hidden: !view.revealed.has(edge.source) || !view.revealed.has(edge.target),
        style: {
          ...edge.style,
          opacity: view.lit.has(edge.source) && view.lit.has(edge.target) ? 1 : DIMMED,
        },
      })),
    [layout, view],
  )

  const totalRef = useRef(steps.length)
  useEffect(() => {
    onExitRef.current = onExit
    totalRef.current = steps.length
  })

  // Fit the group being revealed (HA3): 400 ms, or a jump with reduced motion.
  const fittedRef = useRef(false)
  useEffect(() => {
    if (!ready) return
    const boxes = view.fit.map((id) => byId.get(id)).filter((node) => node !== undefined)
    if (boxes.length === 0) return
    const left = Math.min(...boxes.map((node) => node.position.x))
    const top = Math.min(...boxes.map((node) => node.position.y))
    const right = Math.max(...boxes.map((node) => node.position.x + (node.width ?? 0)))
    const bottom = Math.max(...boxes.map((node) => node.position.y + (node.height ?? 0)))
    const animate = fittedRef.current && !prefersReducedMotion()
    fittedRef.current = true
    void flow.fitBounds(
      { x: left, y: top, width: right - left, height: bottom - top },
      { padding: 0.3, duration: animate ? CAMERA_MS : 0 },
    )
  }, [ready, view, byId, flow, size])

  // Say each step (HA7).
  useEffect(() => {
    if (spoken && announce) announce(spoken)
  }, [spoken, announce])

  // The progress bar and counter fade 2 s after the last input (HA4).
  useEffect(() => {
    const timer = setTimeout(() => dispatch({ type: 'hideHud' }), HUD_MS)
    return () => clearTimeout(timer)
  }, [state.inputs])

  // Full screen when the browser allows it; the overlay covers the window anyway (HA1).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const before = document.activeElement as HTMLElement | null
    stage.focus()
    let entered = false
    const onFullscreen = () => {
      if (document.fullscreenElement === stage) entered = true
      else if (entered) onExitRef.current()
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    try {
      void stage.requestFullscreen?.()?.catch(() => undefined)
    } catch {
      // Refused: the full-window overlay stays.
    }
    const onResize = () => setSize((value) => value + 1)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      window.removeEventListener('resize', onResize)
      if (document.fullscreenElement === stage) void document.exitFullscreen?.().catch(() => {})
      if (before?.isConnected) before.focus()
    }
  }, [])

  // Keys (HA4). Caught before the app's own shortcuts, which must not edit
  // the map underneath; Tab stays inside the dialog (HA7).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopImmediatePropagation()
      if (event.key === 'F5') {
        event.preventDefault()
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const buttons = Array.from(
          stage.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        )
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.shiftKey
          ? index <= 0
            ? buttons.length - 1
            : index - 1
          : (index + 1) % buttons.length
        buttons[next]?.focus()
        dispatch({ type: 'wake' })
        return
      }
      const target = event.target as HTMLElement | null
      // A focused control keeps Enter and Space for itself.
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        target?.closest('button') &&
        stage.contains(target)
      )
        return
      const action = presentKeyAction(event)
      if (!action) return
      event.preventDefault()
      if (action === 'exit') onExitRef.current()
      else dispatch({ type: 'key', action, total: totalRef.current })
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!stage.contains(event.target as HTMLElement | null)) stage.focus()
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])

  const progress = steps.length > 1 ? view.index / (steps.length - 1) : 1
  const stageStyle = {
    background: preset.palette.background,
    '--present-ring': preset.palette.text,
    '--present-halo': preset.palette.background,
  } as CSSProperties

  return (
    <div
      ref={stageRef}
      className={`present-stage${state.hud ? ' present-hud-shown' : ''}`}
      style={stageStyle}
      role="dialog"
      aria-modal="true"
      aria-label={text('label', { title: root.title })}
      tabIndex={-1}
      data-testid="present-stage"
      data-step={view.index + 1}
      data-current={view.current}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        dispatch({ type: 'next', total: steps.length })
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0]
        if (!touch) return
        const started = touchRef.current
        touchRef.current = started
          ? { ...started, fingers: Math.max(started.fingers, event.touches.length) }
          : { x: touch.clientX, y: touch.clientY, at: Date.now(), fingers: event.touches.length }
      }}
      onTouchEnd={(event) => {
        const start = touchRef.current
        if (!start || event.touches.length > 0) return
        touchRef.current = null
        const touch = event.changedTouches[0]
        const dx = touch ? touch.clientX - start.x : 0
        const dy = touch ? touch.clientY - start.y : 0
        if (start.fingers >= 2) {
          // A two-finger tap leaves (HA4).
          if (Date.now() - start.at < 500 && Math.abs(dx) < 30 && Math.abs(dy) < 30) {
            event.preventDefault()
            onExitRef.current()
          }
          return
        }
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
          event.preventDefault()
          dispatch({ type: dx < 0 ? 'next' : 'previous', total: steps.length })
        }
      }}
    >
      <div className="present-canvas" aria-hidden="true">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={() => setReady(true)}
          minZoom={0.1}
          maxZoom={1.75}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling
          disableKeyboardA11y
          ariaLabelConfig={SILENT_ARIA}
          proOptions={{ hideAttribution: true }}
        />
      </div>
      {state.captions && notes ? (
        <div className="present-caption" data-testid="present-caption">
          {notes}
        </div>
      ) : null}
      {state.blank ? (
        <div className="present-blank" data-testid="present-blank">
          <span className="present-sr">{text('blanked')}</span>
        </div>
      ) : null}
      <div className="present-hud" role="group" aria-label={text('controls')}>
        <div
          className="present-progress"
          role="progressbar"
          aria-label={text('progress')}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={view.index + 1}
        >
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <button
          type="button"
          className="present-button"
          aria-label={text('previous')}
          title={text('previous')}
          disabled={view.index === 0}
          onClick={() => dispatch({ type: 'previous', total: steps.length })}
        >
          ‹
        </button>
        <span className="present-counter" data-testid="present-counter">
          {state.typed
            ? text('goTo', { n: state.typed })
            : text('counter', { n: view.index + 1, total: steps.length })}
        </span>
        <button
          type="button"
          className="present-button"
          aria-label={text('next')}
          title={text('next')}
          disabled={view.index >= steps.length - 1}
          onClick={() => dispatch({ type: 'next', total: steps.length })}
        >
          ›
        </button>
        <button
          type="button"
          className="present-button"
          aria-label={text('exit')}
          title={text('exit')}
          data-testid="present-exit"
          onClick={() => onExitRef.current()}
        >
          ×
        </button>
      </div>
      {announce ? null : (
        <div className="present-sr" role="status" aria-live="polite">
          {spoken}
        </div>
      )}
    </div>
  )
}
