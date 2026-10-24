import { t } from '../i18n'
import '../i18n/en/images'
import { isQuotaError } from '../io/quota'
import { pickFile } from '../io/files'
import { cleanAlt } from '../map/image'
import type { NodeImage, TreeNode } from '../schema/types'
import { focusSection, focusViewOf, useEditor, type Section } from '../store/editor'
import { useProjects } from '../store/projects'
import { addChild, findNode, makeNode } from '../store/treeOps'
import { showToast } from '../components/toastStore'
import { imageCodec } from './codec'
import { ImageError, storeImage } from './process'

export { setImageCodec } from './codec'

/**
 * Putting images on nodes (#149, HC3), loaded on demand. Each change is one
 * undo step that edits only the node's `image` field; the bytes stay in the
 * asset store, so undo and redo never re-encode anything.
 */

/** A node to put the image on, or the parent of a new node made for it. */
export type ImageTarget =
  | { section: Section; id: string }
  | { section: Section; parentId: string; title?: string | undefined }

/** Put `image` on node `id` (or remove it with null), copying only the path. */
export function setNodeImage(root: TreeNode, id: string, image: NodeImage | null): TreeNode {
  if (root.id === id) {
    if (image === null) {
      if (!root.image) return root
      const { image: _image, ...rest } = root
      return rest
    }
    const old = root.image
    const same =
      old &&
      old.asset === image.asset &&
      old.w === image.w &&
      old.h === image.h &&
      old.alt === image.alt
    return same ? root : { ...root, image: { ...image } }
  }
  if (!root.children?.length) return root
  let changed = false
  const children = root.children.map((child) => {
    const next = setNodeImage(child, id, image)
    if (next !== child) changed = true
    return next
  })
  return changed ? { ...root, children } : root
}

/** The section the keyboard is in: Map and Outline edit the map. */
export function activeImageSection(): Section {
  const { view, activeSection } = useEditor.getState()
  return focusSection(focusViewOf(view, activeSection))
}

/** The parent of a new node for a picture: the focused branch, or the root. */
function newNodeParent(section: Section): string | null {
  const tree = useProjects.getState().current?.[section]
  if (!tree) return null
  const editor = useEditor.getState()
  const view = focusViewOf(editor.view, editor.activeSection)
  const focused = focusSection(view) === section ? editor.focus[view] : null
  return focused && findNode(tree, focused) ? focused : tree.id
}

/**
 * Where a pasted picture goes in `section`: the selected node, or else a new
 * child of the root (or of the branch the view is focused on).
 */
export function imageTarget(section: Section = activeImageSection()): ImageTarget | null {
  const tree = useProjects.getState().current?.[section]
  const parentId = newNodeParent(section)
  if (!tree || !parentId) return null
  const { selection } = useEditor.getState()
  if (selection && findNode(tree, selection)) return { section, id: selection }
  return { section, parentId }
}

/** Where a picture was dropped: a map node, an Outline/Brainstorm row, or neither. */
export interface DropSpot {
  mapId: string | null
  rowId: string | null
  rowSection: Section
}

/**
 * Where a dropped picture goes (HC3): the node under the pointer, or else a
 * new node named after the file (even when a node is selected).
 */
export function dropTarget(spot: DropSpot, fileName: string): ImageTarget | null {
  const project = useProjects.getState().current
  if (!project) return null
  const section: Section = spot.mapId ? 'map' : spot.rowId ? spot.rowSection : activeImageSection()
  const id = spot.mapId ?? spot.rowId
  if (id && findNode(project[section], id)) return { section, id }
  const parentId = newNodeParent(section)
  return parentId ? { section, parentId, title: titleFromFileName(fileName) } : null
}

/** A file's name without its extension, or undefined for a generic one. */
export function titleFromFileName(name: string): string | undefined {
  const title = name.replace(/\.[a-z0-9]+$/i, '').trim()
  return title && !/^image$/i.test(title) ? title.slice(0, 200) : undefined
}

/**
 * Process `file`, store it, and put it on the target node (or a new child of
 * the target parent) in one undo step. Problems are shown as a toast.
 */
export async function attachImage(file: Blob, target: ImageTarget): Promise<boolean> {
  const startedOn = useProjects.getState().currentId
  let image: NodeImage
  try {
    const meta = await storeImage(file, imageCodec())
    image = { asset: meta.hash, w: meta.w, h: meta.h }
  } catch (error) {
    const message =
      error instanceof ImageError
        ? error.message
        : isQuotaError(error)
          ? t('img.storageFull')
          : t('img.failed', { error: error instanceof Error ? error.message : String(error) })
    showToast(message, 'error', 9000)
    return false
  }
  // The project may have changed while the picture was being processed.
  const project = useProjects.getState().current
  if (!project || useProjects.getState().currentId !== startedOn) return false
  const tree = project[target.section]
  const editor = useEditor.getState()
  if ('id' in target) {
    if (!findNode(tree, target.id)) return false
    editor.applyTree(target.section, (root) => setNodeImage(root, target.id, image))
    editor.select(target.id)
    editor.ensureVisible(target.id)
    return true
  }
  const parentId = findNode(tree, target.parentId) ? target.parentId : tree.id
  const title = target.title ?? titleFromFileName((file as File).name ?? '') ?? t('img.nodeTitle')
  const node = makeNode(title, { image })
  editor.applyTree(target.section, (root) => addChild(root, parentId, node))
  editor.select(node.id)
  editor.ensureVisible(node.id)
  return true
}

/** Ctrl+V with a picture (HC3): onto the selected node, or a new one. */
export async function pasteImage(file: Blob): Promise<boolean> {
  const target = imageTarget()
  return target ? attachImage(file, target) : false
}

/** A picture dropped on `element` (HC3): onto the node under it, or a new one. */
export async function dropImage(file: File, element: Element | null): Promise<boolean> {
  const row = element?.closest('[data-node-id]')
  const target = dropTarget(
    {
      mapId: element?.closest('.react-flow__node')?.getAttribute('data-id') ?? null,
      rowId: row?.getAttribute('data-node-id') ?? null,
      rowSection: row?.getAttribute('data-node-section') === 'brainstorm' ? 'brainstorm' : 'map',
    },
    file.name,
  )
  return target ? attachImage(file, target) : false
}

/** "Add image…": choose a picture file for node `id`. */
export async function pickAndAttach(target: { section: Section; id: string }): Promise<boolean> {
  const file = await pickFile('image/*')
  if (!file) return false
  return attachImage(file, target)
}

/** "Remove image": one undo step; the asset stays stored for undo. */
export function removeImage(section: Section, id: string): void {
  useEditor.getState().applyTree(section, (root) => setNodeImage(root, id, null))
}

/** Change the alt text of node `id`'s image (one undo step; empty removes it). */
export function setImageAlt(section: Section, id: string, alt: string): void {
  const tree = useProjects.getState().current?.[section]
  const image = tree ? findNode(tree, id)?.node.image : undefined
  if (!image) return
  const text = cleanAlt(alt)
  const { alt: _old, ...rest } = image
  useEditor
    .getState()
    .applyTree(section, (root) => setNodeImage(root, id, text ? { ...rest, alt: text } : rest))
}
