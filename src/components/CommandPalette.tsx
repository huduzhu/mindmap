import { Fragment, useId, useMemo, useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useUi } from '../store/ui'
import { useT } from '../i18n'
import '../i18n/en/commands'
import { type Command, filterCommands, useCommands } from './commands'

function CommandPaletteDialog({
  onClose,
  initialQuery,
}: {
  onClose: () => void
  initialQuery: string
}) {
  const t = useT()
  const commands = useCommands()
  const [query, setQuery] = useState(initialQuery)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const listId = useId()
  const optionId = (index: number) => `${listId}-option-${index}`

  useDialogA11y(dialogRef, {
    isOpen: true,
    onClose,
    initialFocusRef: inputRef,
    labelledBy: titleId,
  })

  // Group headers are derived per row so nothing is mutated during render.
  const results = useMemo(() => {
    const matched = filterCommands(commands, query)
    return matched.map((command, index) => ({
      command,
      startsGroup: index === 0 || matched[index - 1].group !== command.group,
    }))
  }, [commands, query])

  // Clamped during render instead of reset in an effect: the filtered list
  // shrinks as the query narrows, so the cursor can fall off the end.
  const activeIndex = results.length === 0 ? 0 : Math.min(active, results.length - 1)

  const runCommand = (command: Command | undefined) => {
    if (!command || command.disabled) return
    onClose()
    command.run()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') return // handled by useDialogA11y
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((results.length + activeIndex + 1) % Math.max(1, results.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((results.length + activeIndex - 1) % Math.max(1, results.length))
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setActive(Math.max(0, results.length - 1))
      return
    }
    // Enter only runs from the input; when focus sits on an option the browser
    // raises click, which would otherwise fire the command twice.
    if (e.key === 'Enter' && e.target === inputRef.current) {
      e.preventDefault()
      runCommand(results[activeIndex]?.command)
    }
  }

  return (
    <div
      className="dialog-backdrop command-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog command-palette"
        role="dialog"
        data-testid="command-palette"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{t('palette.title')}</h2>
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label={t('palette.search')}
          placeholder={t('palette.placeholder')}
          data-testid="command-palette-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
        />
        {results.length === 0 ? (
          <p className="muted command-empty" data-testid="command-empty">
            {t('palette.none', { query: query.trim() })}
          </p>
        ) : (
          <ul
            id={listId}
            className="command-list"
            role="listbox"
            aria-label={t('palette.commands')}
            data-testid="command-list"
          >
            {results.map(({ command, startsGroup }, index) => (
              <Fragment key={command.id}>
                {startsGroup && (
                  <li className="command-group" role="presentation">
                    {command.group}
                  </li>
                )}
                <li
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={command.disabled || undefined}
                  className={`command-item${index === activeIndex ? ' command-item-active' : ''}${
                    command.disabled ? ' command-item-disabled' : ''
                  }`}
                  data-testid={`command-item-${command.id}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runCommand(command)}
                >
                  <span className="command-item-title">{command.title}</span>
                  {command.shortcut && (
                    <kbd className="command-item-shortcut">{command.shortcut}</kbd>
                  )}
                </li>
              </Fragment>
            ))}
          </ul>
        )}
        <p className="command-hint muted">{t('palette.hint')}</p>
      </div>
    </div>
  )
}

/**
 * Mounted once at the App root. `Ctrl+K` / `Cmd+K` is bound in `App.tsx` so it
 * works from the start screen too, where no toolbar is rendered.
 */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const initialQuery = useUi((s) => s.paletteQuery)
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  if (!open) return null
  return <CommandPaletteDialog initialQuery={initialQuery} onClose={() => setPaletteOpen(false)} />
}
