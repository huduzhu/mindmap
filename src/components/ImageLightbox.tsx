import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useT } from '../i18n'
import '../i18n/en/images'
import './lightbox.css'
import { getAsset } from '../assets/store'
import { pickAndAttach, removeImage, setImageAlt } from '../assets/attach'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'
import { useUi } from '../store/ui'
import type { Section } from '../store/editor'
import type { NodeImage } from '../schema/types'
import { quote } from '../a11y/describe'
import { MAX_ALT_LENGTH } from '../map/image'
import { isComposing } from './ime'

/**
 * The image lightbox (#149, HC6), loaded on demand: the full picture of one
 * node, zoomed with the wheel, a pinch or +/−, moved by dragging or the arrow
 * keys, and fitted again with 0. The description (alt text) is edited here;
 * each change is one undo step. Esc closes it.
 */

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const STEP = 1.25
const PAN_STEP = 40

interface View {
  /** 1 fits the picture in the window. */
  zoom: number
  x: number
  y: number
}

const FIT: View = { zoom: 1, x: 0, y: 0 }
const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

/** Zoom to `zoom` keeping the point `at` (relative to the stage centre) still. */
function zoomAt(view: View, zoom: number, at: { x: number; y: number }): View {
  const next = clampZoom(zoom)
  const ratio = next / view.zoom
  return { zoom: next, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio }
}

export function ImageLightboxHost({ onClose }: { onClose: () => void }) {
  const target = useUi((s) => s.imageViewer)
  const node = useProjects((s) => {
    const tree = target ? s.current?.[target.section] : undefined
    return tree && target ? findNode(tree, target.id)?.node : undefined
  })
  if (!target || !node?.image) return null
  return (
    <Lightbox
      key={`${target.id}:${node.image.asset}`}
      section={target.section}
      id={target.id}
      title={node.title}
      image={node.image}
      onClose={onClose}
    />
  )
}

function Lightbox({
  section,
  id,
  title,
  image,
  onClose,
}: {
  section: Section
  id: string
  title: string
  image: NodeImage
  onClose: () => void
}) {
  const t = useT()
  const titleId = useId()
  const altId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [view, setView] = useState<View>(FIT)
  const [draft, setDraft] = useState(image.alt ?? '')
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  const commitAlt = () => setImageAlt(section, id, draft)
  const close = () => {
    commitAlt()
    onClose()
  }
  useDialogA11y(dialogRef, {
    isOpen: true,
    onClose: close,
    labelledBy: titleId,
    initialFocusRef: stageRef,
  })

  // The full picture, only while the lightbox shows it.
  useEffect(() => {
    let live = true
    let made: string | null = null
    void getAsset(image.asset).then(
      (blob) => {
        if (!live) return
        made = blob ? URL.createObjectURL(blob) : null
        setUrl(made)
      },
      () => {
        if (live) setUrl(null)
      },
    )
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [image.asset])

  const centre = (clientX: number, clientY: number) => {
    const box = stageRef.current?.getBoundingClientRect()
    if (!box) return { x: 0, y: 0 }
    return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 }
  }

  const onWheel = (event: ReactWheelEvent) => {
    const factor = Math.exp(-event.deltaY * 0.0015)
    const at = centre(event.clientX, event.clientY)
    setView((current) => zoomAt(current, current.zoom * factor, at))
  }

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const all = pointers.current
    const last = all.get(event.pointerId)
    if (!last) return
    const now = { x: event.clientX, y: event.clientY }
    // With two or more pointers down, another one than this.
    const other =
      all.size >= 2 ? [...all.entries()].find(([key]) => key !== event.pointerId)?.[1] : undefined
    if (other) {
      // Pinch: zoom by how much the two fingers spread, around their midpoint.
      const before = Math.hypot(last.x - other.x, last.y - other.y)
      const after = Math.hypot(now.x - other.x, now.y - other.y)
      const at = centre((now.x + other.x) / 2, (now.y + other.y) / 2)
      if (before > 0) setView((current) => zoomAt(current, (current.zoom * after) / before, at))
    } else {
      const dx = now.x - last.x
      const dy = now.y - last.y
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    }
    all.set(event.pointerId, now)
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId)
  }

  const zoomBy = (factor: number) =>
    setView((current) => zoomAt(current, current.zoom * factor, { x: 0, y: 0 }))

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (isComposing(event)) return
    // Keep the map's own shortcuts (Delete, Enter, Space…) away from the map.
    if (event.key !== 'Tab') event.stopPropagation()
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, button')) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const pan = (dx: number, dy: number) =>
      setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    const actions: Record<string, () => void> = {
      '+': () => zoomBy(STEP),
      '=': () => zoomBy(STEP),
      '-': () => zoomBy(1 / STEP),
      _: () => zoomBy(1 / STEP),
      '0': () => setView(FIT),
      ArrowLeft: () => pan(PAN_STEP, 0),
      ArrowRight: () => pan(-PAN_STEP, 0),
      ArrowUp: () => pan(0, PAN_STEP),
      ArrowDown: () => pan(0, -PAN_STEP),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  const percent = Math.round(view.zoom * 100)

  return (
    <div
      className="dialog-backdrop lightbox-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog lightbox"
        role="dialog"
        data-testid="image-lightbox"
        onKeyDown={onKeyDown}
      >
        <div className="lightbox-bar">
          <h2 id={titleId} className="lightbox-title">
            {t('img.dialogTitle', { title: quote(title) })}
          </h2>
          <span className="muted lightbox-size">{t('img.size', { w: image.w, h: image.h })}</span>
          <div className="lightbox-zoom" role="group" aria-label={t('img.zoom', { percent })}>
            <button type="button" onClick={() => zoomBy(1 / STEP)} title={t('img.zoomOut')}>
              −
            </button>
            <output className="lightbox-percent" data-testid="lightbox-zoom">
              {percent}%
            </output>
            <button type="button" onClick={() => zoomBy(STEP)} title={t('img.zoomIn')}>
              +
            </button>
            <button type="button" onClick={() => setView(FIT)} title={t('img.fit')}>
              {t('img.fit')}
            </button>
          </div>
          <button
            type="button"
            className="lightbox-close"
            onClick={close}
            aria-label={t('img.close')}
            title={t('img.close')}
            data-testid="lightbox-close"
          >
            ×
          </button>
        </div>
        <div
          ref={stageRef}
          className="lightbox-stage"
          tabIndex={0}
          aria-label={t('img.help')}
          title={t('img.help')}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => setView(FIT)}
          data-testid="lightbox-stage"
        >
          {url ? (
            <img
              src={url}
              alt={draft.trim() || image.alt || ''}
              draggable={false}
              data-testid="lightbox-img"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
            />
          ) : (
            <p className="muted lightbox-message">
              {url === null ? t('img.unavailable') : t('img.loading')}
            </p>
          )}
        </div>
        <div className="lightbox-footer">
          <label htmlFor={altId}>{t('img.alt')}</label>
          <input
            id={altId}
            type="text"
            value={draft}
            maxLength={MAX_ALT_LENGTH}
            placeholder={t('img.altPlaceholder')}
            title={t('img.altHint')}
            data-testid="lightbox-alt"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitAlt}
            onKeyDown={(event) => {
              if (isComposing(event)) return
              if (event.key === 'Enter') {
                event.preventDefault()
                commitAlt()
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              commitAlt()
              onClose()
              void pickAndAttach({ section, id })
            }}
          >
            {t('img.replace')}
          </button>
          <button
            type="button"
            data-testid="lightbox-remove"
            onClick={() => {
              onClose()
              removeImage(section, id)
            }}
          >
            {t('img.remove')}
          </button>
        </div>
      </div>
    </div>
  )
}
