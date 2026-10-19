import { useEffect, useId, useRef, useState } from 'react'

export interface ToolbarMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
  /** Draw a divider above this item. */
  separatorBefore?: boolean
}

/**
 * A toolbar menu button (#76), extracted from the old Export menu so Project ▾
 * and Export ▾ behave the same: the first enabled item takes focus, arrows and
 * Home/End move, Escape or a click outside closes, focus returns to the button.
 */
export function ToolbarMenu({
  label,
  items,
  disabled,
  testId,
}: {
  label: string
  items: ToolbarMenuItem[]
  disabled?: boolean
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    const toggle = toggleRef.current
    if (!menu) return
    const enabled = () =>
      Array.from(
        menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])'),
      )
    enabled()[0]?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        return
      }
      if (e.key === 'Tab') {
        setOpen(false)
        return
      }
      const list = enabled()
      const idx = list.indexOf(document.activeElement as HTMLButtonElement)
      let next: number | null = null
      if (e.key === 'ArrowDown') next = (idx + 1) % list.length
      else if (e.key === 'ArrowUp') next = (idx - 1 + list.length) % list.length
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = list.length - 1
      if (next === null) return
      e.preventDefault()
      list[next]?.focus()
    }
    menu.addEventListener('keydown', onKeyDown)
    return () => {
      menu.removeEventListener('keydown', onKeyDown)
      // Only pull focus back if it is still inside the menu (or lost); an item
      // that opened a dialog has already moved focus where it belongs.
      const active = document.activeElement
      if (!active || active === document.body || menu.contains(active)) toggle?.focus()
    }
  }, [open])

  return (
    <div className="toolbar-menu-wrap" data-testid={testId}>
      <button
        type="button"
        ref={toggleRef}
        id={`${menuId}-toggle`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label} ▾
      </button>
      {open && (
        <>
          <div className="toolbar-menu-backdrop" onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            id={menuId}
            className="toolbar-menu"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby={`${menuId}-toggle`}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={[
                  item.danger ? 'danger' : '',
                  item.separatorBefore ? 'toolbar-menu-separated' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
