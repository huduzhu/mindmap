import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useResolvedPreset } from '../hooks/usePreset'
import { useT } from '../i18n'
import '../i18n/en/pickers'
import { quote } from '../a11y/describe'
import { firstEmoji } from '../map/marks'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode, setMark } from '../store/treeOps'
import { useUi } from '../store/ui'
import { isComposing } from './ime'

/** A small curated set (#148b); any other emoji can be typed below the grid. */
const MARKERS = [
  '⭐',
  '🔥',
  '✅',
  '❗',
  '❓',
  '💡',
  '⚠️',
  '🚩',
  '📌',
  '🎯',
  '🚀',
  '💰',
  '📅',
  '⏰',
  '🔒',
  '🛠️',
  '📝',
  '💬',
  '👍',
  '👎',
  '❤️',
  '😀',
  '🐞',
  '🏆',
]

const ICON_COLUMNS = 5

/**
 * Arrow keys move between the options of a radio group laid out in
 * `columns` columns (roving focus); Home and End jump to the ends.
 */
function moveInGrid(event: KeyboardEvent<HTMLDivElement>, columns: number) {
  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  )
  const index = options.indexOf(document.activeElement as HTMLButtonElement)
  if (index === -1) return
  const step: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
  }
  let next: number | null = null
  if (event.key in step)
    next = Math.min(options.length - 1, Math.max(0, index + (step[event.key] ?? 0)))
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = options.length - 1
  if (next === null) return
  event.preventDefault()
  options[next]?.focus()
}

/** "Colour…" and "Marker…" (#148b): pick a node's colour or emoji marker. */
export function MarkerPickerHost({ onClose }: { onClose: () => void }) {
  const t = useT()
  const target = useUi((s) => s.markerPicker)
  const project = useProjects((s) => s.current)
  const preset = useResolvedPreset(project?.preset ?? 'default')
  const dialogRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  useDialogA11y(dialogRef, {
    isOpen: true,
    onClose,
    labelledBy: titleId,
    initialFocusRef: currentRef,
  })

  const node = target && project ? findNode(project[target.section], target.id)?.node : undefined
  if (!target || !node) return null

  const apply = (value: number | string | undefined) => {
    useEditor
      .getState()
      .applyTree(target.section, (tree) => setMark(tree, target.id, target.kind, value))
    onClose()
  }

  const colors = preset.palette.branchColors
  const currentSlot = node.color ? ((node.color - 1) % colors.length) + 1 : 0
  const title = quote(node.title)

  const option = (
    key: string,
    checked: boolean,
    label: string,
    value: number | string | undefined,
    content: ReactNode,
    extra: { className?: string; style?: CSSProperties } = {},
  ) => (
    <button
      key={key}
      ref={checked ? currentRef : undefined}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      tabIndex={checked ? 0 : -1}
      className={`marker-option${checked ? ' marker-option-current' : ''}${extra.className ? ` ${extra.className}` : ''}`}
      style={extra.style}
      data-testid={`marker-option-${key}`}
      onClick={() => apply(value)}
    >
      {content}
    </button>
  )

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog marker-picker"
        role="dialog"
        data-testid={`marker-picker-${target.kind}`}
      >
        <h2 id={titleId}>
          {target.kind === 'color'
            ? t('marks.colorTitle', { title })
            : t('marks.markerTitle', { title })}
        </h2>
        {target.kind === 'color' ? (
          <>
            <div
              className="marker-grid marker-colors"
              role="radiogroup"
              aria-label={t('marks.colorChoices')}
              onKeyDown={(event) => moveInGrid(event, colors.length + 1)}
            >
              {option('none', currentSlot === 0, t('marks.noColor'), undefined, '∅', {
                className: 'marker-none',
              })}
              {colors.map((color, index) =>
                option(
                  `color-${index + 1}`,
                  currentSlot === index + 1,
                  t('marks.colorN', { n: index + 1 }),
                  index + 1,
                  currentSlot === index + 1 ? '✓' : '',
                  { className: 'marker-swatch', style: { background: color } },
                ),
              )}
            </div>
            <p className="muted">{t('marks.colorHint')}</p>
          </>
        ) : (
          <>
            <div
              className="marker-grid marker-icons"
              role="radiogroup"
              aria-label={t('marks.markerChoices')}
              onKeyDown={(event) => moveInGrid(event, ICON_COLUMNS)}
            >
              {option('none', !node.icon, t('marks.noMarker'), undefined, '∅', {
                className: 'marker-none',
              })}
              {MARKERS.map((icon, index) =>
                option(`icon-${index}`, node.icon === icon, icon, icon, icon),
              )}
            </div>
            <form
              className="marker-custom"
              onSubmit={(event) => {
                event.preventDefault()
                const icon = firstEmoji(typed)
                if (icon) apply(icon)
                else setProblem(t('marks.invalid'))
              }}
            >
              <input
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value)
                  setProblem(null)
                }}
                onKeyDown={(event) => {
                  // Enter that accepts an IME candidate must not submit the form.
                  if (event.key === 'Enter' && isComposing(event)) event.preventDefault()
                }}
                placeholder={t('marks.custom')}
                aria-label={t('marks.custom')}
                aria-invalid={problem !== null}
                maxLength={32}
                data-testid="marker-custom"
              />
              <button type="submit">{t('marks.use')}</button>
            </form>
            {problem ? (
              <p className="prompt-dialog-error" role="alert">
                {problem}
              </p>
            ) : null}
          </>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
