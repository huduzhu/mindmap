import type { CSSProperties } from 'react'
import type { TaskProgress } from '../map/marks'
import { tagColor } from '../map/tags'
import './nodeMarks.css'

/**
 * The marks a node shows around its title (#148): a task checkbox in front
 * and the "3/5" progress of its task children after it. Shared by the map,
 * the Outline and Brainstorm rows, the details panel and the HTML viewer, so
 * they take their text as props (the viewer has its own strings).
 *
 * The checkbox is a button with role="checkbox" rather than an <input>: image
 * exports clone the DOM, and a cloned input loses its checked state.
 */
export function TaskCheck({
  done,
  label,
  title,
  className = '',
  onToggle,
  testId,
}: {
  done: boolean
  label: string
  title?: string
  className?: string
  /** Without it the box is shown read-only (the HTML viewer). */
  onToggle?: () => void
  testId?: string
}) {
  const classes = `node-check${done ? ' node-check-done' : ''}${className ? ` ${className}` : ''}`
  if (!onToggle) {
    return (
      <span className={classes} role="img" aria-label={label} data-testid={testId}>
        <span aria-hidden>✓</span>
      </span>
    )
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      title={title}
      className={classes}
      data-testid={testId}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span aria-hidden>✓</span>
    </button>
  )
}

export function ProgressChip({
  progress,
  title,
  className = '',
  testId,
}: {
  progress: TaskProgress
  title: string
  className?: string
  testId?: string
}) {
  const complete = progress.done === progress.total
  return (
    <span
      className={`node-progress${complete ? ' node-progress-complete' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      data-testid={testId}
    >
      {progress.done}/{progress.total}
    </span>
  )
}

/** The emoji marker in front of a title (#148b). */
export function NodeIcon({ icon, hidden = false }: { icon: string; hidden?: boolean }) {
  return (
    <span className="node-icon" aria-hidden={hidden || undefined}>
      {icon}
    </span>
  )
}

/**
 * A node's tags as small chips (#150, HB3): each in the colour its name hashes
 * to among the preset's branch colours, at most `max` and then "+N". The text
 * is the node's own colour on a light tint of the tag colour, so it reads on
 * every preset.
 */
export function NodeTags({
  tags,
  colors,
  max = 3,
  className = '',
  hidden = false,
}: {
  tags: readonly string[] | undefined
  colors: readonly string[]
  max?: number
  className?: string
  hidden?: boolean
}) {
  if (!tags || tags.length === 0) return null
  const shown = tags.length > max ? tags.slice(0, max) : tags
  return (
    <span
      className={`node-tags${className ? ` ${className}` : ''}`}
      aria-hidden={hidden || undefined}
    >
      {shown.map((tag) => (
        <span
          key={tag}
          className="node-tag"
          style={{ '--tag-color': tagColor(tag, colors) } as CSSProperties}
        >
          #{tag}
        </span>
      ))}
      {tags.length > shown.length ? (
        <span className="node-tag node-tag-more">+{tags.length - shown.length}</span>
      ) : null}
    </span>
  )
}
