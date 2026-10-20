import { useId, useMemo, useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { TreeNode } from '../schema/types'
import { useEditor } from '../store/editor'
import { addLink, linkedIds } from '../store/links'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'
import { useUi } from '../store/ui'
import { useT } from '../i18n'
import '../i18n/en/pickers'
import { isComposing } from './ime'

const MAX_RESULTS = 50

interface Candidate {
  id: string
  title: string
  path: string
}

/** Every map node in reading order, with its parent's title for context. */
function candidates(map: TreeNode): Candidate[] {
  const out: Candidate[] = []
  const walk = (node: TreeNode, parent: string) => {
    out.push({ id: node.id, title: node.title, path: parent })
    for (const child of node.children ?? []) walk(child, node.title)
  }
  walk(map, '')
  return out
}

/**
 * "Link to…" (#90): pick the other end of a cross-link by typing part of its
 * title, instead of the old hidden gesture (select exactly two nodes, then
 * the context menu). Mounted once at the App root; opened with
 * `useUi.setLinkPickFrom(nodeId)`.
 */
export function LinkPickerHost() {
  const from = useUi((state) => state.linkPickFrom)
  const map = useProjects((state) => state.current?.map)
  if (!from || !map || !findNode(map, from)) return null
  return <LinkPicker key={from} from={from} map={map} />
}

function LinkPicker({ from, map }: { from: string; map: TreeNode }) {
  const t = useT()
  const links = useProjects((state) => state.current?.links)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const listId = useId()
  const close = () => useUi.getState().setLinkPickFrom(null)
  useDialogA11y(dialogRef, {
    isOpen: true,
    onClose: close,
    labelledBy: titleId,
    initialFocusRef: inputRef,
  })

  const source = findNode(map, from)!.node
  const results = useMemo(() => {
    const taken = new Set([from, ...linkedIds(links, from)])
    const needle = query.trim().toLocaleLowerCase()
    return candidates(map)
      .filter((candidate) => !taken.has(candidate.id))
      .filter((candidate) => !needle || candidate.title.toLocaleLowerCase().includes(needle))
      .slice(0, MAX_RESULTS)
  }, [map, links, from, query])
  const activeIndex = results.length === 0 ? 0 : Math.min(active, results.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  const pick = (candidate: Candidate | undefined) => {
    if (!candidate) return
    close()
    useEditor.getState().applyLinks((current) => addLink(current, from, candidate.id))
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={dialogRef}
        className="dialog command-palette link-picker"
        role="dialog"
        data-testid="link-picker"
        onKeyDown={(event) => {
          if (isComposing(event)) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            setActive((results.length + activeIndex + step) % Math.max(1, results.length))
          } else if (event.key === 'Enter' && event.target === inputRef.current) {
            event.preventDefault()
            pick(results[activeIndex])
          }
        }}
      >
        <h2 id={titleId}>{t('link.title', { name: source.title || t('common.untitled') })}</h2>
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          role="combobox"
          aria-label={t('link.find')}
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
          placeholder={t('link.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
        />
        {results.length === 0 ? (
          <p className="muted command-empty">
            {query.trim() ? t('link.noMatch', { query: query.trim() }) : t('link.none')}
          </p>
        ) : (
          <ul id={listId} className="command-list" role="listbox" aria-label={t('link.nodes')}>
            {results.map((candidate, index) => (
              <li
                key={candidate.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={`command-item${index === activeIndex ? ' command-item-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(candidate)}
              >
                <span className="command-item-title">
                  {candidate.title || t('common.untitled')}
                </span>
                {candidate.path && (
                  <span className="command-item-context">
                    {t('link.in', { name: candidate.path })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="command-hint muted">{t('link.hint')}</p>
      </div>
    </div>
  )
}
