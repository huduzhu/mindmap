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

/** Open dialogs, innermost last: only the topmost one answers keys from outside it (#208). */
const openDialogs: HTMLElement[] = []

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

    // Focusable from script, so focus has somewhere to go back to (#208).
    if (!container.hasAttribute('tabindex')) container.tabIndex = -1
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
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) {
        // Nothing to focus in the dialog.
        e.preventDefault()
        return
      }
      const active = document.activeElement as HTMLElement | null
      if (!container.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    // Focus lost to the page (the focused button was removed or disabled):
    // the topmost dialog takes it back and still answers Esc and Tab (#208).
    const lost = () => {
      const active = document.activeElement
      return (
        openDialogs.filter((dialog) => dialog.isConnected).pop() === container &&
        (!active || active === document.body || active.matches(':disabled'))
      )
    }
    const onDocumentKeyDown = (e: KeyboardEvent) => {
      if (!lost()) return
      onKeyDown(e)
      e.stopPropagation()
    }
    // Browsers do not reliably fire focusout when the focused element is removed
    // or disabled, so watch for exactly those changes instead.
    const watcher = new MutationObserver(() => lost() && container.focus())
    watcher.observe(container, { subtree: true, childList: true, attributeFilter: ['disabled'] })

    openDialogs.push(container)
    container.addEventListener('keydown', onKeyDown)
    document.addEventListener('keydown', onDocumentKeyDown, true)

    return () => {
      openDialogs.splice(openDialogs.indexOf(container), 1)
      container.removeEventListener('keydown', onKeyDown)
      watcher.disconnect()
      document.removeEventListener('keydown', onDocumentKeyDown, true)
      // A trigger that is gone (its row was deleted) hands focus to the dialog below (#208).
      const back = returnFocusTarget?.isConnected
        ? returnFocusTarget
        : openDialogs[openDialogs.length - 1]
      if (back && typeof back.focus === 'function') back.focus()
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, labelledBy])
}
