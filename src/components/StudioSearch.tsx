import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { searchNodes } from '../search/nodes'
import { revealNode } from '../search/reveal'
import { focusSection, focusViewOf, useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'
import { tn, useT } from '../i18n'
import { focusView } from './detailsPanel'
import { dialogOpen } from './dialogOpen'
import { isComposing } from './ime'

interface StudioSearchProps {
  /**
   * Make the box visible when it is folded away (the toolbar's "⋯" on narrow
   * screens) so Ctrl/Cmd+F can focus it (#147).
   */
  onRevealBox?: () => void
}

export function StudioSearch({ onRevealBox }: StudioSearchProps = {}) {
  const t = useT()
  const current = useProjects((s) => s.current)
  const view = useEditor((s) => s.view)
  const activeSection = useEditor((s) => s.activeSection)
  const currentFocusView = focusViewOf(view, activeSection)
  const focusId = useEditor((s) => s.focus[currentFocusView])
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // Where focus was before the box took it, so Esc can go back there (#147).
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const revealBoxRef = useRef(onRevealBox)
  useEffect(() => {
    revealBoxRef.current = onRevealBox
  })
  // Set once Enter steps through the results: only then may a result outside
  // a focused branch be shown, which leaves focus (#146).
  const steppedRef = useRef(false)

  const tree = current ? current[focusSection(currentFocusView)] : null
  const matchIds = useMemo(
    () => (tree ? searchNodes(tree, query).map((hit) => hit.id) : []),
    [tree, query],
  )
  // In a focused view, the results inside the branch (#146).
  const inside = useMemo(() => {
    const branch = tree && focusId ? findNode(tree, focusId)?.node : undefined
    return branch ? new Set(searchNodes(branch, query).map((hit) => hit.id)) : null
  }, [tree, focusId, query])
  const matchSig = matchIds.join(',')
  const insideSig = inside ? [...inside].join(',') : null

  // Shows the current result when the query or the step through the results
  // changes, not after every edit that changes the matches: that cancelled a
  // rename just started and moved the selection back (#193).
  const revealedRef = useRef<{ query: string; index: number } | null>(null)
  useEffect(() => {
    if (!query.trim()) {
      revealedRef.current = null
      return
    }
    const last = revealedRef.current
    if (last && last.query === query && last.index === index) return
    if (useEditor.getState().editing) return
    revealedRef.current = { query, index }
    const id = matchSig ? matchSig.split(',')[Math.min(index, matchIds.length - 1)] : undefined
    if (!id) return
    if (insideSig !== null && !steppedRef.current && !insideSig.split(',').includes(id)) return
    revealNode(id)
  }, [matchSig, matchIds.length, insideSig, index, query])

  // Ctrl/Cmd+F finds nodes, not just the ones on screen (#147): the map only
  // renders what is in view, so the browser's own Find misses most of a big
  // map. Pressed again while in the box, it is the browser's Find after all.
  const hasProject = Boolean(current)
  useEffect(() => {
    if (!hasProject) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'f') return
      const input = inputRef.current
      if (!input || document.activeElement === input) return
      const target = event.target as HTMLElement | null
      if (target?.closest?.('[role="dialog"]') || dialogOpen()) return
      event.preventDefault()
      if (input.getClientRects().length === 0 && revealBoxRef.current) {
        const reveal = revealBoxRef.current
        flushSync(() => reveal())
      }
      input.focus()
      input.select()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [hasProject])

  if (!current) return null

  const trimmed = query.trim()
  const outside = inside ? matchIds.filter((id) => !inside.has(id)).length : 0
  const position =
    matchIds.length === 0
      ? tn('search.matches', 0)
      : t('search.position', {
          index: Math.min(index + 1, matchIds.length),
          count: matchIds.length,
        })
  const countLabel = !trimmed
    ? ''
    : outside > 0
      ? `${position} · ${tn('search.outside', outside)}`
      : position

  const goBack = () => {
    const back = returnFocusRef.current
    returnFocusRef.current = null
    if (back?.isConnected && back.closest('#tab-panel') && !back.closest('.node-details')) {
      back.focus()
    } else {
      focusView()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(e)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setQuery('')
      setIndex(0)
      steppedRef.current = false
      goBack()
      return
    }
    if (e.key !== 'Enter' || matchIds.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    const delta = e.shiftKey ? -1 : 1
    steppedRef.current = true
    const next = (Math.min(index, matchIds.length - 1) + delta + matchIds.length) % matchIds.length
    if (next === index) {
      // A single match: show it again (the user may have panned away).
      revealNode(matchIds[next])
    } else {
      setIndex(next)
    }
  }

  return (
    <label className="studio-search">
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        title={t('search.title')}
        data-testid="studio-search"
        onFocus={(e) => {
          const from = e.relatedTarget as HTMLElement | null
          if (from && from !== e.currentTarget) returnFocusRef.current = from
        }}
        onChange={(e) => {
          const value = e.target.value
          setQuery(value)
          steppedRef.current = false
          // In a focused view, start at the first result inside the branch (#146).
          const branch = tree && focusId ? findNode(tree, focusId)?.node : undefined
          const first = branch ? searchNodes(branch, value)[0]?.id : undefined
          const start =
            first && tree ? searchNodes(tree, value).findIndex((hit) => hit.id === first) : 0
          setIndex(Math.max(0, start))
        }}
        onKeyDown={onKeyDown}
      />
      {trimmed ? (
        <span className="studio-search-count" data-testid="search-count" aria-live="polite">
          {countLabel}
        </span>
      ) : null}
    </label>
  )
}
