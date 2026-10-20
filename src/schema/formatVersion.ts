import type { Project, TreeNode } from './types'
import type { ValidationError } from './validate'

/**
 * File-format guard (GE0a, Candidate G). Newer versions of the app may add
 * optional fields to project files; this app rejects fields it does not know
 * (the schemas allow no extra properties). Such a file is not broken, it was
 * made by a newer version: it must be reported ("update this PC") and never
 * moved aside, overwritten or stripped of what this app cannot read.
 *
 * A file may say so itself with `"app": { "minVersion": n }`; without that, a
 * file whose only problems are unknown properties counts as newer too.
 */

/**
 * The newest file format this app reads completely.
 * 1: the original format. 2: task `done`, node `color`/`icon` and link
 * `label` (#148a–c, optional fields in schema version 1). 3: node `tags` (#150).
 * 4: node `image` (#149).
 */
export const FORMAT_VERSION = 4

type FileFormat = 1 | 2 | 3 | 4

/** Whether a node uses a field of format 2. Tolerates unvalidated input. */
function nodeNeedsV2(node: TreeNode): boolean {
  return node.done !== undefined || node.color !== undefined || node.icon !== undefined
}

/** Whether a node uses a field of format 3 (#150). */
function nodeNeedsV3(node: TreeNode): boolean {
  return node.tags !== undefined
}

/** Whether a node uses a field of format 4 (#149). */
function nodeNeedsV4(node: TreeNode): boolean {
  return node.image !== undefined
}

/** The newest format any node of `root` needs, 1 when it uses no newer field. */
function treeFormat(root: TreeNode | undefined): FileFormat {
  let format: FileFormat = 1
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (nodeNeedsV4(node as TreeNode)) return 4
    if (nodeNeedsV3(node as TreeNode)) format = 3
    else if (nodeNeedsV2(node as TreeNode) && format < 2) format = 2
    const children = (node as TreeNode).children
    if (Array.isArray(children)) for (const child of children) stack.push(child)
  }
  return format
}

/**
 * The oldest file format that can read `project` completely: 4 once any node
 * has an `image` (#149); 3 once any node has `tags` (#150); 2 once any node in either tree uses `done`, `color` or
 * `icon`, or any link has a `label` (#148); otherwise 1, and such files stay
 * readable by older apps.
 */
export function requiredFormatVersion(project: Project): FileFormat {
  const labelled =
    Array.isArray(project.links) &&
    project.links.some((link) => link && typeof link === 'object' && link.label !== undefined)
  const trees = Math.max(treeFormat(project.map), treeFormat(project.brainstorm)) as FileFormat
  return labelled && trees < 2 ? 2 : trees
}

/**
 * The project as written to a file that may reach another PC (folder sync,
 * GitHub, JSON export, backups): with `"app": { "minVersion": n }` when it
 * needs format 2 or newer, so an older app reports it instead of changing it, and
 * without any `app` block otherwise, byte for byte as older apps wrote it.
 */
export function projectForFile<T extends Project>(project: T): T {
  const content = withoutAppInfo(project)
  const required = requiredFormatVersion(content)
  return required > 1 ? { ...content, app: { minVersion: required } } : content
}

/** The format a document declares it needs, when it declares one. */
export function declaredMinVersion(doc: unknown): number | null {
  const app = (doc as { app?: { minVersion?: unknown } } | null)?.app
  const version = app?.minVersion
  return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : null
}

/**
 * Whether a project file that failed validation was made by a newer app: it
 * declares a newer format, or every error is an unknown property.
 */
export function isNewerFormat(doc: unknown, errors: ValidationError[]): boolean {
  // Only project files travel between versions; an AI reply (template,
  // brainstorm update) with extra fields is just a wrong reply.
  if ((doc as { kind?: unknown } | null)?.kind !== 'project') return false
  const declared = declaredMinVersion(doc)
  if (declared !== null && declared > FORMAT_VERSION) return true
  return errors.length > 0 && errors.every((error) => error.keyword === 'additionalProperties')
}

/** The document without the `app` block, which is metadata, not content. */
export function withoutAppInfo<T>(doc: T): T {
  if (!doc || typeof doc !== 'object' || !('app' in doc)) return doc
  const { app: _app, ...rest } = doc as T & { app?: unknown }
  return rest as T
}
