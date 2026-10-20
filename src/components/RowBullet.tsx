import { useState } from 'react'
import type { OutlineRow } from '../outliner/flatten'
import { tn, useT } from '../i18n'
import '../i18n/en/outliner'
import { isDone, isTask, taskProgress } from '../map/marks'
import type { TreeNode } from '../schema/types'
import type { Section } from '../store/editor'
import { NodeTags, ProgressChip, TaskCheck } from './NodeMarks'
import type { TagFilterResult } from '../map/tags'
import { toggleTaskDone } from './taskActions'
import '../i18n/en/images'
import { NodeThumb } from './NodeThumb'
import { useEditor } from '../store/editor'
import { useUi } from '../store/ui'

/**
 * The bullet in front of an Outline or Brainstorm row (#145): a disclosure
 * triangle on rows with children (click to fold or unfold), a dot on the
 * rest, a diamond on the root. The row itself carries `aria-expanded`, so the
 * triangle is hidden from screen readers.
 */
export function RowBullet({
  row,
  isRoot,
  onToggle,
}: {
  row: OutlineRow
  isRoot: boolean
  onToggle: () => void
}) {
  const t = useT()
  const hasChildren = (row.node.children?.length ?? 0) > 0
  if (isRoot || !hasChildren) {
    return (
      <span className="outliner-bullet" aria-hidden>
        {isRoot ? '◆' : '•'}
      </span>
    )
  }
  const folded = row.hidden > 0
  return (
    <span
      className="outliner-bullet outliner-twisty"
      aria-hidden
      title={folded ? t('outliner.unfold', { count: row.hidden }) : t('outliner.fold')}
      data-testid={`row-fold-${row.node.id}`}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      {folded ? '▸' : '▾'}
    </span>
  )
}

/** "+12" after a folded row's title: how many ideas the fold hides (#145). */
export function HiddenCount({ row }: { row: OutlineRow }) {
  const t = useT()
  if (row.hidden === 0) return null
  return (
    <span
      className="outliner-hidden-count"
      title={t('outliner.unfold', { count: row.hidden })}
      data-testid={`row-hidden-${row.node.id}`}
    >
      +{row.hidden}
    </span>
  )
}

/** A row's colour marker (#148b): a short bar in the preset's colour. */
export function RowAccent({ color }: { color: string | undefined }) {
  if (!color) return null
  return <span className="row-accent" style={{ background: color }} aria-hidden />
}

/** The checkbox in front of a task row (#148a). */
export function RowCheck({ node, section }: { node: TreeNode; section: Section }) {
  const t = useT()
  if (!isTask(node)) return null
  return (
    <TaskCheck
      done={isDone(node)}
      label={t('task.checkLabel', { title: node.title })}
      title={t('task.checkTitle')}
      className="outliner-check"
      onToggle={() => toggleTaskDone(section, node.id)}
      testId={`row-check-${node.id}`}
    />
  )
}

/** "3/5" after a row whose children include tasks (#148a). */
export function RowProgress({ node }: { node: TreeNode }) {
  const t = useT()
  const progress = taskProgress(node)
  if (!progress) return null
  return (
    <ProgressChip
      progress={progress}
      title={t('task.progress', { ...progress })}
      className="outliner-progress"
      testId={`row-progress-${node.id}`}
    />
  )
}

/**
 * A row's tags after its title (#150), and how many matches of the tag
 * filter its fold hides ("+2 tagged").
 */
export function RowTags({
  node,
  colors,
  result,
}: {
  node: TreeNode
  colors: readonly string[]
  result: TagFilterResult | null
}) {
  const t = useT()
  const hits = result?.folded.get(node.id)
  return (
    <>
      <NodeTags tags={node.tags} colors={colors} max={10} className="row-tags" />
      {hits ? (
        <span
          className="node-tag-hits"
          title={tn('tags.hiddenHits', hits)}
          data-testid={`row-tag-hits-${node.id}`}
        >
          {t('tags.hits', { count: hits })}
        </span>
      ) : null}
    </>
  )
}

/**
 * The 🖼 marker after the title of a row with a picture (#149, HC7): hovering
 * or focusing it shows the thumbnail, clicking opens the lightbox. Its label
 * (with the description) also describes the row to screen readers (`id`).
 */
export function RowImage({ node, section, id }: { node: TreeNode; section: Section; id: string }) {
  const t = useT()
  const [preview, setPreview] = useState(false)
  if (!node.image) return null
  const alt = node.image.alt?.trim()
  const label = alt ? t('img.markerWithAlt', { alt }) : t('img.marker')
  return (
    <span
      className="row-image"
      onMouseEnter={() => setPreview(true)}
      onMouseLeave={() => setPreview(false)}
    >
      <button
        type="button"
        id={id}
        className="row-image-marker"
        aria-label={label}
        title={label}
        data-testid={`row-image-${node.id}`}
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
        onClick={(event) => {
          event.stopPropagation()
          const editor = useEditor.getState()
          editor.setActiveSection(section)
          editor.select(node.id)
          useUi.getState().setImageViewer({ section, id: node.id })
        }}
      >
        🖼
      </button>
      {preview ? (
        <span
          className="row-image-preview"
          aria-hidden
          data-testid={`row-image-preview-${node.id}`}
        >
          <NodeThumb image={node.image} />
        </span>
      ) : null}
    </span>
  )
}
