import type { TreeNode } from '../schema/types'
import { roleLabel, t, tn, type MessageKey } from '../i18n'
import { isTask, taskProgress } from '../map/marks'

/**
 * Plain-language descriptions of tree edits for the screen-reader live region
 * (#85). Derived by comparing the tree before and after, so every edit path —
 * keyboard, drag, context menu, outliner, palette — is described the same way
 * without each call site having to say what it did.
 */

interface Info {
  node: TreeNode
  parentId: string | null
  index: number
}

function index(tree: TreeNode): Map<string, Info> {
  const map = new Map<string, Info>()
  const stack: Info[] = [{ node: tree, parentId: null, index: 0 }]
  while (stack.length > 0) {
    const info = stack.pop()!
    map.set(info.node.id, info)
    info.node.children?.forEach((child, i) =>
      stack.push({ node: child, parentId: info.node.id, index: i }),
    )
  }
  return map
}

function countDescendants(node: TreeNode): number {
  let count = 0
  const stack = [...(node.children ?? [])]
  while (stack.length > 0) {
    const next = stack.pop()!
    count += 1
    if (next.children) stack.push(...next.children)
  }
  return count
}

const tagList = (tags: readonly string[]) => tags.map((tag) => `#${tag}`).join(', ')

export const quote = (title: string) => `“${title.trim() || t('common.untitled')}”`
/** What changed between two versions of a tree, or null if nothing a reader would notice. */
export function describeTreeChange(before: TreeNode, after: TreeNode): string | null {
  if (before === after) return null
  const was = index(before)
  const now = index(after)
  const added = [...now.keys()].filter((id) => !was.has(id))
  const removed = [...was.keys()].filter((id) => !now.has(id))

  const titleIn = (map: Map<string, Info>, id: string | null) =>
    id ? quote(map.get(id)?.node.title ?? '') : t('announce.theMap')

  if (added.length > 0 && removed.length === 0) {
    const tops = added.filter((id) => !added.includes(now.get(id)!.parentId ?? ''))
    if (tops.length > 1) return t('announce.addedMany', { count: tops.length })
    const top = now.get(tops[0])!
    const inner = countDescendants(top.node)
    const params = { title: quote(top.node.title), parent: titleIn(now, top.parentId) }
    return inner > 0 ? tn('announce.addedWith', inner, params) : t('announce.added', params)
  }
  if (removed.length > 0 && added.length === 0) {
    const tops = removed.filter((id) => !removed.includes(was.get(id)!.parentId ?? ''))
    if (tops.length > 1) return t('announce.deletedMany', { count: tops.length })
    const inner = removed.length - 1
    const title = quote(was.get(tops[0])!.node.title)
    return inner > 0
      ? tn('announce.deletedWith', inner, { title })
      : t('announce.deleted', { title })
  }
  if (added.length > 0 && removed.length > 0) return t('announce.mapUpdated')

  const moved: string[] = []
  const reordered: string[] = []
  const renamed: string[] = []
  const folded: string[] = []
  const checked: string[] = []
  const marked: string[] = []
  const tagged: string[] = []
  const imaged: string[] = []
  const other: string[] = []
  for (const [id, next] of now) {
    const prev = was.get(id)!
    if (prev.node === next.node && prev.parentId === next.parentId && prev.index === next.index)
      continue
    if (prev.parentId !== next.parentId) moved.push(id)
    else if (prev.index !== next.index) reordered.push(id)
    const a = prev.node
    const b = next.node
    if (a.title !== b.title) renamed.push(id)
    if (Boolean(a.collapsed) !== Boolean(b.collapsed)) folded.push(id)
    if (a.role === b.role && Boolean(a.done) !== Boolean(b.done)) checked.push(id)
    if (a.color !== b.color || a.icon !== b.icon) marked.push(id)
    if ((a.tags ?? []).join(' ') !== (b.tags ?? []).join(' ')) tagged.push(id)
    if (a.image?.asset !== b.image?.asset || a.image?.alt !== b.image?.alt) imaged.push(id)
    if (a.notes !== b.notes || a.role !== b.role || a.side !== b.side) other.push(id)
  }

  if (moved.length === 1) {
    const info = now.get(moved[0])!
    return t('announce.movedUnder', {
      title: quote(info.node.title),
      parent: titleIn(now, info.parentId),
    })
  }
  if (moved.length > 1) return t('announce.movedMany', { count: moved.length })
  if (renamed.length === 1) {
    return t('announce.renamed', { title: quote(now.get(renamed[0])!.node.title) })
  }
  if (renamed.length > 1) return t('announce.renamedMany', { count: renamed.length })
  if (folded.length === 1) {
    const node = now.get(folded[0])!.node
    return t(node.collapsed ? 'announce.collapsed' : 'announce.expanded', {
      title: quote(node.title),
    })
  }
  if (folded.length > 1) return tn('announce.foldedMany', folded.length)
  if (checked.length === 1 && other.length === 0) {
    const node = now.get(checked[0])!.node
    return t(node.done ? 'announce.done' : 'announce.notDone', { title: quote(node.title) })
  }
  if (checked.length > 1) return t('announce.updatedMany', { count: checked.length })
  if (marked.length === 1 && other.length === 0) {
    const prev = was.get(marked[0])!.node
    const node = now.get(marked[0])!.node
    const title = quote(node.title)
    if (prev.icon !== node.icon) {
      return node.icon
        ? t('announce.icon', { title, icon: node.icon })
        : t('announce.iconCleared', { title })
    }
    return node.color ? t('announce.color', { title }) : t('announce.colorCleared', { title })
  }
  if (marked.length > 1) return t('announce.updatedMany', { count: marked.length })
  // Tags (#150): "Tags of “Login”: #p1, #backend".
  if (tagged.length === 1 && other.length === 0) {
    const node = now.get(tagged[0])!.node
    const title = quote(node.title)
    return node.tags?.length
      ? t('announce.tags', { title, tags: tagList(node.tags) })
      : t('announce.tagsCleared', { title })
  }
  if (tagged.length > 1) return t('announce.updatedMany', { count: tagged.length })
  // Images (#149): added, replaced, removed or given a new description.
  if (imaged.length === 1 && other.length === 0) {
    const prev = was.get(imaged[0])!.node
    const node = now.get(imaged[0])!.node
    const title = quote(node.title)
    if (!node.image) return t('announce.imageRemoved', { title })
    if (prev.image?.asset === node.image.asset) {
      return node.image.alt
        ? t('announce.imageAlt', { title, alt: node.image.alt })
        : t('announce.imageAltCleared', { title })
    }
    return t('announce.image', { title })
  }
  if (imaged.length > 1) return t('announce.updatedMany', { count: imaged.length })
  if (other.length === 1) {
    const prev = was.get(other[0])!.node
    const node = now.get(other[0])!.node
    if (prev.notes !== node.notes) return t('announce.notes', { title: quote(node.title) })
    if (prev.role !== node.role) {
      return node.role
        ? t('announce.role', { title: quote(node.title), role: roleLabel(node.role) })
        : t('announce.roleCleared', { title: quote(node.title) })
    }
    return t('announce.side', {
      title: quote(node.title),
      side: t(`announce.side.${node.side ?? 'auto'}` as MessageKey),
    })
  }
  if (other.length > 1) return t('announce.updatedMany', { count: other.length })
  if (reordered.length > 0) {
    // A swap moves two siblings; name the one whose position changed most.
    const [id] = [...reordered].sort(
      (x, y) =>
        Math.abs(now.get(y)!.index - was.get(y)!.index) -
        Math.abs(now.get(x)!.index - was.get(x)!.index),
    )
    const up = now.get(id)!.index < was.get(id)!.index
    return t(up ? 'announce.movedUp' : 'announce.movedDown', {
      title: quote(now.get(id)!.node.title),
    })
  }
  return null
}

/**
 * Accessible name for a map node (#85): "‹title›, level N, task, done,
 * M children, 3 of 5 tasks done, collapsed, has notes".
 */
export function nodeAccessibleName(node: TreeNode, depth: number): string {
  const parts = [
    `${node.icon ? `${node.icon} ` : ''}${node.title.trim() || t('common.untitled')}`,
    depth === 0 ? t('a11y.centralTopic') : t('a11y.level', { depth }),
  ]
  if (isTask(node)) parts.push(t('a11y.task'), node.done ? t('a11y.done') : t('a11y.notDone'))
  const children = node.children?.length ?? 0
  if (children > 0) parts.push(tn('a11y.children', children))
  const progress = taskProgress(node)
  if (progress) parts.push(t('task.progress', { ...progress }))
  if (children > 0 && node.collapsed) parts.push(t('a11y.collapsed'))
  if (node.notes) parts.push(t('a11y.hasNotes'))
  if (node.tags?.length) parts.push(t('a11y.tags', { tags: tagList(node.tags) }))
  if (node.image) parts.push(imageDescription(node.image.alt))
  return parts.join(t('a11y.separator'))
}

/** "image: a whiteboard photo" (#149), or "has an image" without alt text. */
export function imageDescription(alt: string | undefined): string {
  return alt?.trim() ? t('a11y.image', { alt: alt.trim() }) : t('a11y.hasImage')
}

/** Cross-link edits (#85): "Linked “A” and “B”" / "Removed the link between “A” and “B”". */
export function describeLinkChange(
  map: TreeNode,
  before: readonly { from: string; to: string; label?: string }[],
  after: readonly { from: string; to: string; label?: string }[],
): string | null {
  const key = (link: { from: string; to: string }) => `${link.from}\u0000${link.to}`
  const had = new Set(before.map(key))
  const has = new Set(after.map(key))
  const added = after.filter((link) => !had.has(key(link)))
  const removed = before.filter((link) => !has.has(key(link)))
  const titles = new Map<string, string>()
  const stack = [map]
  while (stack.length > 0) {
    const node = stack.pop()!
    titles.set(node.id, node.title)
    if (node.children) stack.push(...node.children)
  }
  const pair = (link: { from: string; to: string }) => ({
    a: quote(titles.get(link.from) ?? ''),
    b: quote(titles.get(link.to) ?? ''),
  })
  if (added.length === 1 && removed.length === 0) return t('announce.linked', pair(added[0]))
  if (removed.length === 1 && added.length === 0) {
    return t('announce.unlinked', pair(removed[0]))
  }
  if (added.length + removed.length > 0) return t('announce.linksChanged')
  // Same links, new labels (#148c).
  const labelOf = new Map(before.map((link) => [key(link), link.label]))
  const relabelled = after.filter((link) => labelOf.get(key(link)) !== link.label)
  if (relabelled.length === 1) {
    const link = relabelled[0]
    return link.label
      ? t('announce.linkLabel', { ...pair(link), label: quote(link.label) })
      : t('announce.linkLabelCleared', pair(link))
  }
  if (relabelled.length > 1) return t('announce.linksChanged')
  return null
}
