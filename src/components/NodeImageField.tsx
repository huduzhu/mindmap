import { useId, useState } from 'react'
import { useT } from '../i18n'
import '../i18n/en/images'
import './imageField.css'
import { pickAndAttach, removeImage, setImageAlt } from '../assets/attach'
import { MAX_ALT_LENGTH } from '../map/image'
import type { TreeNode } from '../schema/types'
import type { Section } from '../store/editor'
import { useUi } from '../store/ui'
import { NodeThumb } from './NodeThumb'

/**
 * The picture of the selected node in the details panel (#149), loaded on
 * demand: its thumbnail (a click opens the lightbox), View / Replace… /
 * Remove, and the description (alt text), saved when the field is left. Each
 * change is one undo step.
 */
export function NodeImageField({ section, node }: { section: Section; node: TreeNode }) {
  const t = useT()
  const image = node.image
  if (!image) return null
  const view = () => useUi.getState().setImageViewer({ section, id: node.id })
  return (
    <div className="node-details-field node-details-image" data-testid="node-details-image">
      <span>{t('img.field')}</span>
      <NodeThumb image={image} onOpen={view} testId="node-details-thumb" />
      <div className="node-details-image-actions">
        <button type="button" onClick={view} data-testid="node-details-image-view">
          {t('canvas.viewImage')}
        </button>
        <button
          type="button"
          onClick={() => void pickAndAttach({ section, id: node.id })}
          data-testid="node-details-image-replace"
        >
          {t('img.replace')}
        </button>
        <button
          type="button"
          onClick={() => removeImage(section, node.id)}
          data-testid="node-details-image-remove"
        >
          {t('img.remove')}
        </button>
      </div>
      <AltField
        key={`${node.id}:${image.alt ?? ''}`}
        section={section}
        id={node.id}
        alt={image.alt ?? ''}
      />
    </div>
  )
}

/** The description, a draft until the field is left (keyed, so it restarts when it changes). */
function AltField({ section, id, alt }: { section: Section; id: string; alt: string }) {
  const t = useT()
  const fieldId = useId()
  const [draft, setDraft] = useState(alt)
  const commit = () => {
    if (draft.trim() !== alt) setImageAlt(section, id, draft)
  }
  return (
    <label className="node-details-image-alt" htmlFor={fieldId}>
      <span className="muted">{t('img.alt')}</span>
      <input
        id={fieldId}
        type="text"
        value={draft}
        maxLength={MAX_ALT_LENGTH}
        placeholder={t('img.altPlaceholder')}
        title={t('img.altHint')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          // Esc puts the saved text back without leaving the panel.
          if (event.key === 'Escape') {
            event.stopPropagation()
            setDraft(alt)
          }
        }}
        data-testid="node-details-image-alt"
      />
    </label>
  )
}
