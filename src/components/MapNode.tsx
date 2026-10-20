import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { MapNodeData } from '../map/layout'
import { resolveNodeStyle } from '../map/nodeStyle'
import type { Preset } from '../schema/types'
import { useEditor } from '../store/editor'
import { toggleFold } from './foldActions'
import { nodeAccessibleName } from '../a11y/describe'
import { useOwnerFocusTarget } from './ownerFocus'
import { RenameInput } from './RenameInput'
import { useNodeTouchGestures } from './nodeGestures'
import { tn, useT } from '../i18n'
import { openNotes } from './detailsPanel'
import { isDone, isTask, taskProgress } from '../map/marks'
import { NodeIcon, NodeTags, ProgressChip, TaskCheck } from './NodeMarks'
import { IMAGE_GAP, MAX_MAP_TAGS } from '../map/layout'
import { thumbSize } from '../map/image'
import { NodeThumb } from './NodeThumb'
import { useUi } from '../store/ui'
import { toggleTaskDone } from './taskActions'

/**
 * Memoized (#140): the canvas re-renders on every edit, and React Flow passes
 * each node only primitives plus its `data`, which the layout now keeps for
 * nodes the edit did not touch — so those skip rendering entirely.
 */
export const MapNode = memo(function MapNode({ id, data, selected }: NodeProps<Node<MapNodeData>>) {
  const t = useT()
  const preset = data.preset as Preset
  const style = resolveNodeStyle(preset, data.node, data.isRoot)
  const commitRename = useEditor((s) => s.commitRename)
  // An image or print capture must not carry the notes text in the marker's
  // tooltip (#178): SVG exports keep attributes.
  const capturing = useEditor((s) => s.capturing)
  const ownerFocus = useOwnerFocusTarget()
  const touch = useNodeTouchGestures(id, !data.editing)
  const task = isTask(data.node)
  const done = isDone(data.node)
  const progress = taskProgress(data.node)
  const tagged = (data.node.tags?.length ?? 0) > 0
  const image = data.node.image
  // The picture sits above the title (#149); layout reserved its height.
  const nodeStyle = image
    ? { ...style, paddingTop: 6 + thumbSize(image).height + IMAGE_GAP }
    : style

  return (
    <div
      className={`map-node${data.isRoot ? ' map-node-root' : ''}${data.hiddenCount > 0 ? ' map-node-collapsed' : ''}${done ? ' map-node-done' : ''}${progress ? ' map-node-has-progress' : ''}${tagged ? ' map-node-has-tags' : ''}${data.editing ? ' nodrag' : ''}`}
      style={nodeStyle}
      data-side={data.side}
      data-color={data.node.color}
      role="group"
      aria-roledescription={t('canvas.nodeRoledescription')}
      aria-label={nodeAccessibleName(data.node, data.depth)}
      aria-current={selected ? 'true' : undefined}
      {...touch}
      onMouseDown={(event) => {
        // A second press of a draggable node starts a drag before the browser's
        // dblclick event reaches React Flow. Claim it here so double-click
        // rename cannot be turned into a move for non-root nodes.
        const target = event.target as HTMLElement
        if (event.detail < 2 || data.editing || target.closest('button, input, select, textarea'))
          return
        event.preventDefault()
        event.stopPropagation()
        const editor = useEditor.getState()
        editor.select(id)
        // Double-clicking the notes marker opens the notes instead (#144).
        if (target.closest('.map-node-notes')) openNotes()
        else editor.setEditing(id)
      }}
      onDoubleClick={(event) => {
        // Handle the gesture at the node itself as well as the React Flow
        // callback. A draggable child can otherwise consume the second click
        // before React Flow delivers onNodeDoubleClick.
        event.preventDefault()
        event.stopPropagation()
        if ((event.target as HTMLElement).closest('.map-node-notes')) return
        const editor = useEditor.getState()
        editor.select(id)
        editor.setEditing(id)
      }}
    >
      <Handle type="source" position={Position.Right} id="source-right" className="map-handle" />
      <Handle type="source" position={Position.Left} id="source-left" className="map-handle" />
      <Handle type="target" position={Position.Left} id="target-left" className="map-handle" />
      <Handle type="target" position={Position.Right} id="target-right" className="map-handle" />

      {image ? (
        <NodeThumb
          image={image}
          className="map-node-image"
          testId={`node-image-${id}`}
          onOpen={() => {
            useEditor.getState().select(id)
            useUi.getState().setImageViewer({ section: 'map', id })
          }}
        />
      ) : null}

      {task ? (
        <TaskCheck
          done={done}
          label={t('task.checkLabel', { title: data.node.title })}
          title={t('task.checkTitle')}
          className="map-node-check nodrag"
          onToggle={() => toggleTaskDone('map', id)}
          testId={`node-check-${id}`}
        />
      ) : null}
      {data.editing ? (
        <RenameInput
          initial={data.node.title}
          className="map-node-input nodrag"
          autoWidth
          onCommit={(draft) => commitRename(id, draft)}
          onToggleDone={() => toggleTaskDone('map', id)}
          returnFocusRef={ownerFocus ?? undefined}
        />
      ) : (
        <>
          {data.node.icon ? <NodeIcon icon={data.node.icon} hidden /> : null}
          <span
            className="map-node-title"
            title={data.node.title.length > 120 ? data.node.title : undefined}
          >
            {data.node.title || ' '}
          </span>
          {progress ? (
            <ProgressChip
              progress={progress}
              title={t('task.progress', { ...progress })}
              className="map-node-progress"
              testId={`node-progress-${id}`}
            />
          ) : null}
          <NodeTags
            tags={data.node.tags}
            colors={preset.palette.branchColors}
            max={MAX_MAP_TAGS}
            className="map-node-tags"
            hidden
          />
          {data.hasNotes ? (
            <span
              className="map-node-notes"
              title={capturing ? undefined : data.node.notes}
              aria-label={t('node.hasNotes')}
            >
              ✎
            </span>
          ) : null}
        </>
      )}

      {data.tagHits ? (
        <span
          className="node-tag-hits map-node-tag-hits"
          title={tn('tags.hiddenHits', data.tagHits)}
          data-testid={`node-tag-hits-${id}`}
        >
          {t('tags.hits', { count: data.tagHits })}
        </span>
      ) : null}
      {data.hasChildren && !data.editing && (
        <button
          type="button"
          className={`map-node-toggle map-node-toggle-${data.side} nodrag`}
          title={
            data.hiddenCount > 0
              ? t('node.expandTitle', { count: data.hiddenCount })
              : t('node.collapseTitle')
          }
          aria-label={
            data.hiddenCount > 0
              ? t('node.expandLabel', { name: data.node.title, count: data.hiddenCount })
              : t('node.collapseLabel', { name: data.node.title })
          }
          aria-expanded={data.hiddenCount === 0}
          onClick={(e) => {
            e.stopPropagation()
            toggleFold('map', id)
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {data.hiddenCount > 0 ? `${data.hiddenCount}` : '−'}
        </button>
      )}
    </div>
  )
})
