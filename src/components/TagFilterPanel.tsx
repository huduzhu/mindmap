import { useId, useMemo, type CSSProperties } from 'react'
import { useResolvedPreset } from '../hooks/usePreset'
import { tn, useT } from '../i18n'
import '../i18n/en/tags'
import { tagColor, type TagFilter } from '../map/tags'
import { applyTagFilter, countNodeTags, pruneToTags } from '../map/tagFilter'
import { focusSection, useEditor, type FocusView } from '../store/editor'
import { useProjects } from '../store/projects'
import { viewRootOf } from './focusActions'
import { pruneSelection } from './foldActions'
import { findNode } from '../store/treeOps'

const NO_FILTER: TagFilter = { tags: [], all: false, hide: false }

/** The toolbar chip that shows a view's filter is on, with × to clear it (#150). */
export function TagFilterChip({ view }: { view: FocusView }) {
  const t = useT()
  const filter = useEditor((s) => s.tagFilter[view])
  if (!filter || filter.tags.length === 0) return null
  const tags = filter.tags.map((tag) => `#${tag}`).join(' ')
  return (
    <span
      className="tag-filter-chip"
      title={t('tags.filterOn', { tags })}
      data-testid="tag-filter-chip"
    >
      <span className="tag-filter-chip-text">{tags}</span>
      <button
        type="button"
        aria-label={t('tags.clearFilter')}
        title={t('tags.clearFilter')}
        onClick={() => useEditor.getState().setTagFilter(view, null)}
        data-testid="tag-filter-chip-clear"
      >
        ×
      </button>
    </span>
  )
}

/**
 * The tag filter bar (#150, HB4), loaded on first use: the tags of the
 * tree the view shows with their counts; pick one or more, choose whether a
 * node needs any or all of them, and whether the others are dimmed (the
 * default) or hidden. The filter belongs to the view and the session.
 */
export function TagFilterPanel({ view, onClose }: { view: FocusView; onClose: () => void }) {
  const t = useT()
  const labelId = useId()
  const tree = useProjects((s) => s.current?.[focusSection(view)])
  const focusId = useEditor((s) => s.focus[view])
  const filter = useEditor((s) => s.tagFilter[view]) ?? NO_FILTER
  const colors = useResolvedPreset(useProjects((s) => s.current?.preset) ?? 'default').palette
    .branchColors
  const root = useMemo(() => (tree ? viewRootOf(tree, focusId) : undefined), [tree, focusId])
  const counts = useMemo(() => countNodeTags(root), [root])
  const matches = useMemo(
    () => (root && filter.tags.length > 0 ? applyTagFilter(root, filter).matches : 0),
    [root, filter],
  )
  const set = (next: Partial<TagFilter>) => {
    const updated = { ...filter, ...next }
    useEditor.getState().setTagFilter(view, updated)
    // Hiding nodes takes them out of the selection too (#199).
    if (root && updated.hide && updated.tags.length > 0) {
      const shown = pruneToTags(root, updated)
      pruneSelection((id) => !findNode(root, id) || Boolean(findNode(shown, id)))
    }
  }
  const toggle = (tag: string) =>
    set({
      tags: filter.tags.includes(tag)
        ? filter.tags.filter((own) => own !== tag)
        : [...filter.tags, tag],
    })

  return (
    <section
      className="tag-filter"
      role="region"
      aria-labelledby={labelId}
      data-testid="tag-filter"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <span id={labelId} className="tag-filter-label">
        {t('tags.panelLabel')}
      </span>
      {counts.length === 0 ? (
        <p className="muted tag-filter-empty">{t('tags.none')}</p>
      ) : (
        <div className="tag-filter-tags" role="group" aria-labelledby={labelId}>
          {counts.map(([tag, count]) => (
            <button
              key={tag}
              type="button"
              className="node-tag tag-filter-tag"
              style={{ '--tag-color': tagColor(tag, colors) } as CSSProperties}
              aria-pressed={filter.tags.includes(tag)}
              aria-label={tn('tags.option', count, { tag })}
              onClick={() => toggle(tag)}
              data-testid={`tag-filter-${tag}`}
            >
              #{tag} <span className="tag-filter-count">{count}</span>
            </button>
          ))}
        </div>
      )}
      <div className="tag-filter-options">
        <span className="tag-filter-choice" role="group" aria-label={t('tags.combine')}>
          <span aria-hidden>{t('tags.combine')}</span>
          <button
            type="button"
            aria-pressed={!filter.all}
            onClick={() => set({ all: false })}
            data-testid="tag-filter-any"
          >
            {t('tags.any')}
          </button>
          <button
            type="button"
            aria-pressed={filter.all}
            onClick={() => set({ all: true })}
            data-testid="tag-filter-all"
          >
            {t('tags.all')}
          </button>
        </span>
        <span className="tag-filter-choice" role="group" aria-label={t('tags.display')}>
          <span aria-hidden>{t('tags.display')}</span>
          <button
            type="button"
            aria-pressed={!filter.hide}
            onClick={() => set({ hide: false })}
            data-testid="tag-filter-highlight"
          >
            {t('tags.highlight')}
          </button>
          <button
            type="button"
            aria-pressed={filter.hide}
            onClick={() => set({ hide: true })}
            data-testid="tag-filter-hide"
          >
            {t('tags.hide')}
          </button>
        </span>
        {filter.tags.length > 0 ? (
          <span className="muted" role="status" data-testid="tag-filter-matches">
            {tn('tags.matches', matches)}
          </span>
        ) : null}
        <button
          type="button"
          disabled={filter.tags.length === 0}
          onClick={() => useEditor.getState().setTagFilter(view, null)}
          data-testid="tag-filter-clear"
        >
          {t('tags.clear')}
        </button>
        <button
          type="button"
          className="tag-filter-close"
          aria-label={t('tags.close')}
          title={t('tags.close')}
          onClick={onClose}
          data-testid="tag-filter-close"
        >
          ×
        </button>
      </div>
    </section>
  )
}
