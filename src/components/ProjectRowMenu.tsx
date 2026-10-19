import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n'

export interface RowMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

/**
 * The ⋯ menu on a start-screen project row (#78). A menu button: arrows,
 * Home/End move between items, Escape or a click elsewhere closes it and
 * focus goes back to the button.
 */
export function ProjectRowMenu({ name, items }: { name: string; items: RowMenuItem[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  return (
    <span className="project-row-menu">
      <button
        ref={triggerRef}
        type="button"
        className="project-row-menu-trigger"
        aria-label={t('row.more', { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="project-row-menu-list"
          role="menu"
          aria-label={t('row.actions', { name })}
          onKeyDown={(event) => {
            const buttons = Array.from(
              menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
            )
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            let next: number | null = null
            if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
            else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = buttons.length - 1
            else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close(true)
              return
            } else if (event.key === 'Tab') {
              close(false)
              return
            }
            if (next !== null) {
              event.preventDefault()
              buttons[next]?.focus()
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={item.danger ? 'danger' : undefined}
              onClick={() => {
                close(true)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
