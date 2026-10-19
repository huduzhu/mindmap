import { useEffect, useRef, type RefObject } from 'react'
import { isComposing } from '../components/ime'

interface DialogA11yOptions {
  isOpen: boolean
  onClose: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
  labelledBy?: string
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return nodes.filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
}

export function useDialogA11y(
  containerRef: RefObject<HTMLElement | null>,
  options: DialogA11yOptions,
) {
  const { isOpen, onClose, initialFocusRef, returnFocusRef, labelledBy } = options
  // Escape must call the latest onClose, not the one captured when the dialog
  // opened; it only worked because every caller passed a stable setter (#65).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const container = containerRef.current
    if (!isOpen || !container) return

    if (labelledBy) container.setAttribute('aria-labelledby', labelledBy)
    container.setAttribute('aria-modal', 'true')

    const returnFocusTarget =
      returnFocusRef?.current ?? (document.activeElement as HTMLElement | null)

    const firstFocusable = focusable(container)[0] ?? container
    const initial = initialFocusRef?.current ?? firstFocusable
    initial.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      // Esc that cancels an input method's candidates must not close the dialog (#167).
      if (isComposing(e)) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable(container)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)

    return () => {
      container.removeEventListener('keydown', onKeyDown)
      if (returnFocusTarget && typeof returnFocusTarget.focus === 'function') {
        returnFocusTarget.focus()
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, labelledBy])
}
