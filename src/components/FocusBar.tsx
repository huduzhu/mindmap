import { useMemo } from 'react'
import { useT } from '../i18n'
import { focusSection, useEditor, type FocusView } from '../store/editor'
import { useProjects } from '../store/projects'
import { pathTo } from '../store/treeOps'
import { focusBackTo } from './focusActions'

/**
 * The breadcrumb bar above a focused view (#146): "Project › Launch ›
 * Pricing". Every crumb but the last goes back to that level; × shows
 * everything again. Esc and Alt+← go up one level from the view itself.
 */
export function FocusBar({ view }: { view: FocusView }) {
  const t = useT()
  const id = useEditor((s) => s.focus[view])
  const tree = useProjects((s) => s.current?.[focusSection(view)])
  const path = useMemo(() => (tree && id ? pathTo(tree, id) : null), [tree, id])
  if (!path) return null

  const goTo = (target: string | null, owner: HTMLElement | null) => {
    focusBackTo(view, target)
    // Back to the view's keyboard (the map's canvas focuses itself when it remounts).
    owner?.querySelector<HTMLElement>('.outliner, .canvas-wrap')?.focus()
  }
  const title = (text: string) => text.trim() || t('common.untitled')

  return (
    <nav className="focus-bar" aria-label={t('focus.label')} data-testid={`focus-bar-${view}`}>
      <ol className="focus-crumbs">
        {path.map((node, index) =>
          index === path.length - 1 ? (
            <li key={node.id}>
              <span className="focus-crumb-current" aria-current="location">
                {title(node.title)}
              </span>
            </li>
          ) : (
            <li key={node.id}>
              <button
                type="button"
                className="focus-crumb"
                onClick={(event) =>
                  goTo(index === 0 ? null : node.id, event.currentTarget.closest('.view-stack'))
                }
              >
                {title(node.title)}
              </button>
            </li>
          ),
        )}
      </ol>
      <span className="focus-bar-hint muted">
        <kbd>Esc</kbd> <kbd>Alt+←</kbd> {t('focus.upHint')}
      </span>
      <button
        type="button"
        className="focus-bar-leave"
        aria-label={t('focus.leave')}
        title={t('focus.leave')}
        data-testid={`focus-leave-${view}`}
        onClick={(event) => goTo(null, event.currentTarget.closest('.view-stack'))}
      >
        ×
      </button>
    </nav>
  )
}
