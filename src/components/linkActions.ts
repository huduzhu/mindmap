import { quote } from '../a11y/describe'
import { t } from '../i18n'
import { useEditor } from '../store/editor'
import { linkBetween, MAX_LINK_LABEL, setLinkLabel } from '../store/links'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'
import { askText } from './promptStore'

/**
 * Set, rename or clear the label of the cross-link between two map nodes
 * (#148c): double-click on the link, the details panel's ✎ or the palette.
 * An empty answer removes the label; the change is one undo step.
 */
export async function editLinkLabel(a: string, b: string): Promise<void> {
  const project = useProjects.getState().current
  const link = linkBetween(project?.links, a, b)
  if (!project || !link) return
  const titleOf = (id: string) => quote(findNode(project.map, id)?.node.title ?? '')
  const value = await askText({
    title: t('link.labelTitle'),
    label: t('link.labelPrompt', { a: titleOf(link.from), b: titleOf(link.to) }),
    initial: link.label ?? '',
    confirmLabel: t('link.save'),
    maxLength: MAX_LINK_LABEL * 4,
    validate: (text) => {
      const count = Array.from(text.trim()).length
      return count > MAX_LINK_LABEL ? t('link.labelTooLong', { max: MAX_LINK_LABEL, count }) : null
    },
  })
  if (value === null) return
  useEditor.getState().applyLinks((links) => setLinkLabel(links, a, b, value))
}
