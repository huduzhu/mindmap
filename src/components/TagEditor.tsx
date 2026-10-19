import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useResolvedPreset } from '../hooks/usePreset'
import { tn, useT } from '../i18n'
import '../i18n/en/tags'
import { quote } from '../a11y/describe'
import { MAX_NODE_TAGS, normalizeNodeTag, tagColor, withTags } from '../map/tags'
import { countNodeTags } from '../map/tagFilter'
import type { TreeNode } from '../schema/types'
import { useEditor, type Section } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'
import { addTagsTo, setTags } from '../store/tagOps'
import { useUi } from '../store/ui'

const MAX_SUGGESTIONS = 8

/** Every node tag of the open project, most used first: the suggestions. */
function useProjectTags(): string[] {
  const map = useProjects((s) => s.current?.map)
  const brainstorm = useProjects((s) => s.current?.brainstorm)
  return useMemo(() => countNodeTags(map, brainstorm).map(([tag]) => tag), [map, brainstorm])
}

/**
 * The tag field (#150, HB2): the tags as chips with × to remove them, and an
 * input that adds a tag on Enter or comma, removes the last one on Backspace
 * when empty, and suggests tags already used in the project (a combobox:
 * ↑/↓ choose, Enter takes the suggestion, Esc closes the list).
 */
export function TagInput({
  tags,
  label,
  onAdd,
  onRemove,
  autoFocus = false,
}: {
  tags: readonly string[]
  label: string
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  autoFocus?: boolean
}) {
  const t = useT()
  const id = useId()
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const colors = useResolvedPreset(useProjects((s) => s.current?.preset) ?? 'default').palette
    .branchColors
  const projectTags = useProjectTags()
  const [draft, setDraft] = useState('')
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const typed = draft.trim().replace(/^#+/, '').toLowerCase()
  const options = projectTags
    .filter((tag) => !tags.includes(tag) && (!typed || tag.startsWith(typed)))
    .slice(0, MAX_SUGGESTIONS)
  const expanded = open && options.length > 0
  const activeOption = expanded && active >= 0 && active < options.length ? active : -1

  const add = (raw: string) => {
    if (!raw.trim()) return
    const tag = normalizeNodeTag(raw)
    if (!tag) {
      setProblem(t('tags.invalid'))
      return
    }
    if (!tags.includes(tag) && tags.length >= MAX_NODE_TAGS) {
      setProblem(t('tags.full'))
      return
    }
    if (!tags.includes(tag)) onAdd(tag)
    setDraft('')
    setActive(-1)
    setProblem(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (options.length === 0) return
      const last = options.length - 1
      if (event.key === 'ArrowDown') setActive(activeOption >= last ? 0 : activeOption + 1)
      else setActive(activeOption <= 0 ? last : activeOption - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      event.stopPropagation()
      if (activeOption >= 0) add(options[activeOption])
      else add(draft)
      return
    }
    if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      onRemove(tags[tags.length - 1])
      return
    }
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className="tag-input">
      {tags.length > 0 ? (
        <ul className="tag-input-chips" data-testid="tag-chips">
          {tags.map((tag) => (
            <li
              key={tag}
              className="node-tag tag-input-chip"
              style={{ '--tag-color': tagColor(tag, colors) } as CSSProperties}
            >
              #{tag}
              <button
                type="button"
                className="tag-input-remove"
                aria-label={t('tags.remove', { tag })}
                title={t('tags.remove', { tag })}
                onClick={() => onRemove(tag)}
                data-testid={`tag-remove-${tag}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        className="tag-input-field"
        value={draft}
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption >= 0 ? `${listId}-${activeOption}` : undefined}
        aria-describedby={hintId}
        aria-invalid={problem !== null}
        placeholder={t('tags.placeholder')}
        maxLength={40}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const value = event.target.value
          // A pasted or typed comma (or space) ends a tag.
          if (/[,\s]/.test(value)) {
            const parts = value.split(/[,\s]+/)
            const rest = parts.pop() ?? ''
            for (const part of parts) add(part)
            setDraft(rest)
          } else {
            setDraft(value)
            setProblem(null)
          }
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
        data-testid="tag-input"
      />
      <ul
        id={listId}
        role="listbox"
        className="tag-input-suggestions"
        aria-label={t('tags.suggestions')}
        hidden={!expanded}
      >
        {options.map((tag, index) => (
          <li
            key={tag}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeOption}
            className={index === activeOption ? 'tag-input-option-active' : undefined}
            // mousedown, not click: the input keeps focus (no blur closing the list first).
            onMouseDown={(event) => {
              event.preventDefault()
              add(tag)
            }}
            data-testid={`tag-suggestion-${tag}`}
          >
            #{tag}
          </li>
        ))}
      </ul>
      <p id={hintId} className="muted tag-input-hint">
        {t('tags.hint')}
      </p>
      {problem ? (
        <p className="prompt-dialog-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  )
}

/** Tag edits on one node, one undo step each. */
function editNodeTags(section: Section, node: TreeNode, next: readonly string[]): void {
  useEditor.getState().applyTree(section, (tree) => setTags(tree, node.id, next))
}

/**
 * The tag field of the details panel (#150): edits the node's tags directly,
 * one undo step per added or removed tag.
 */
export function NodeTagField({
  section,
  node,
  autoFocus = false,
}: {
  section: Section
  node: TreeNode
  autoFocus?: boolean
}) {
  const t = useT()
  const tags = node.tags ?? []
  return (
    <TagInput
      tags={tags}
      label={t('tags.inputLabel')}
      autoFocus={autoFocus}
      onAdd={(tag) => editNodeTags(section, node, withTags(node.tags, [tag]))}
      onRemove={(tag) =>
        editNodeTags(
          section,
          node,
          tags.filter((own) => own !== tag),
        )
      }
    />
  )
}

/**
 * "Tags…" from the node menu (one node: edits its tags as you go) and "Add
 * tag to selection" from the palette (several: the tags typed are added to
 * every node with Add, in one undo step).
 */
export function TagDialogHost({ onClose }: { onClose: () => void }) {
  const t = useT()
  const target = useUi((s) => s.tagEditor)
  const project = useProjects((s) => s.current)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [pending, setPending] = useState<string[]>([])
  useDialogA11y(dialogRef, { isOpen: true, onClose, labelledBy: titleId })

  const tree = target && project ? project[target.section] : undefined
  const nodes = target && tree ? target.ids.flatMap((id) => findNode(tree, id)?.node ?? []) : []
  if (!target || nodes.length === 0) return null
  const single = nodes.length === 1 ? nodes[0] : null

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="dialog tag-dialog" role="dialog" data-testid="tag-dialog">
        <h2 id={titleId}>
          {single
            ? t('tags.dialogTitle', { title: quote(single.title) })
            : tn('tags.dialogMany', nodes.length)}
        </h2>
        {single ? (
          <NodeTagField section={target.section} node={single} autoFocus />
        ) : (
          <TagInput
            tags={pending}
            label={t('tags.inputLabel')}
            autoFocus
            onAdd={(tag) => setPending((list) => withTags(list, [tag]))}
            onRemove={(tag) => setPending((list) => list.filter((own) => own !== tag))}
          />
        )}
        <div className="dialog-actions">
          {single ? (
            <button type="button" onClick={onClose} data-testid="tag-dialog-done">
              {t('tags.done')}
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={pending.length === 0}
                data-testid="tag-dialog-add"
                onClick={() => {
                  const ids = new Set(nodes.map((node) => node.id))
                  useEditor
                    .getState()
                    .applyTree(target.section, (root) => addTagsTo(root, ids, pending))
                  onClose()
                }}
              >
                {t('tags.add')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
