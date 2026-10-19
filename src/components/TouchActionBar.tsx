import { useT } from '../i18n'

export interface TouchActionBarProps {
  title: string
  isRoot: boolean
  hasChildren: boolean
  collapsed: boolean
  onAddChild: () => void
  onAddSibling: () => void
  onRename: () => void
  onNotes: () => void
  onDelete: () => void
  onToggleFold: () => void
  onMore: (x: number, y: number) => void
}

/**
 * On touch devices a selected map node gets a row of large buttons (#91,
 * decision L-D2), standing in for the keyboard shortcuts a phone does not have.
 */
export function TouchActionBar(props: TouchActionBarProps) {
  const t = useT()
  const name = props.title.trim() || t('common.untitled')
  const button = (label: string, aria: string, onClick: () => void, icon: string) => (
    <button type="button" aria-label={aria} onClick={onClick}>
      <span aria-hidden="true" className="touch-bar-icon">
        {icon}
      </span>
      <span aria-hidden="true">{label}</span>
    </button>
  )
  return (
    <div className="touch-bar" role="toolbar" aria-label={t('touch.bar')} data-testid="touch-bar">
      {button(t('touch.addChild'), t('touch.addChildLabel', { name }), props.onAddChild, '↳')}
      {!props.isRoot &&
        button(
          t('touch.addSibling'),
          t('touch.addSiblingLabel', { name }),
          props.onAddSibling,
          '+',
        )}
      {button(t('touch.rename'), t('touch.renameLabel', { name }), props.onRename, '✎')}
      {button(t('touch.notes'), t('touch.notesLabel', { name }), props.onNotes, '¶')}
      {props.hasChildren &&
        button(
          props.collapsed ? t('touch.unfold') : t('touch.fold'),
          props.collapsed ? t('touch.unfoldLabel', { name }) : t('touch.foldLabel', { name }),
          props.onToggleFold,
          props.collapsed ? '▸' : '▾',
        )}
      {!props.isRoot &&
        button(t('touch.delete'), t('touch.deleteLabel', { name }), props.onDelete, '🗑')}
      <button
        type="button"
        aria-label={t('touch.moreLabel', { name })}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          props.onMore(box.left + box.width / 2, box.top)
        }}
      >
        <span aria-hidden="true" className="touch-bar-icon">
          ⋯
        </span>
        <span aria-hidden="true">{t('touch.more')}</span>
      </button>
    </div>
  )
}
