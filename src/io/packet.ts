import type { Depth, Intent } from '../schema/constants'
import type { AnalysisPacket, NodeImage, Project, TreeNode } from '../schema/types'
import { findNode } from '../store/treeOps'

/**
 * Pictures (#149) never go to the AI: a node's `image` is left out, and its
 * description goes along as the last line of its notes, "[image: alt]" (or
 * "[image]" when it has none), whatever the depth, so the AI knows the
 * picture is there and what it shows. When the reply is put back into its
 * source project, `restoreImages` takes those lines out again and gives each
 * node its picture back by id.
 */
export function imageMarker(alt?: string): string {
  const text = alt?.replace(/\s+/g, ' ').trim()
  return text ? `[image: ${text}]` : '[image]'
}

const IMAGE_LINE = /^\[image(?:: [^\n]*)?\]$/

function prepare(node: TreeNode, depth: Depth): TreeNode {
  const { image, ...rest } = node
  let notes = depth === 'titles' ? undefined : node.notes
  if (image)
    notes = notes?.trim() ? `${notes}\n\n${imageMarker(image.alt)}` : imageMarker(image.alt)
  return { ...rest, notes, children: node.children?.map((child) => prepare(child, depth)) }
}

/** Notes without the "[image: …]" lines the packet added. */
function withoutImageLines(notes: string): string {
  return notes
    .split('\n')
    .filter((line) => !IMAGE_LINE.test(line.trim()))
    .join('\n')
    .trim()
}

/**
 * An AI reply going back into its source project: give each node the picture
 * the node with the same id has in `sources`, and drop the "[image: …]" note
 * lines the packet added.
 */
export function restoreImages(tree: TreeNode, sources: (TreeNode | undefined)[]): TreeNode {
  const images = new Map<string, NodeImage>()
  const stack = sources.filter((source): source is TreeNode => Boolean(source))
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.image) images.set(node.id, node.image)
    if (node.children) stack.push(...node.children)
  }
  const walk = (node: TreeNode): TreeNode => {
    const next: TreeNode = { ...node }
    if (typeof node.notes === 'string' && node.notes.includes('[image')) {
      const notes = withoutImageLines(node.notes)
      if (notes) next.notes = notes
      else delete next.notes
    }
    const image = node.image ?? images.get(node.id)
    if (image) next.image = image
    if (node.children) next.children = node.children.map(walk)
    return next
  }
  return walk(tree)
}

const GOALS: Record<Intent, string> = {
  expand:
    'Expand this brainstorm with more ideas. Add new bullets where they genuinely help; keep the voice concise and practical.',
  convert:
    'Convert this brainstorm into a structured mind map. Group related ideas under clear branches and keep titles short.',
  improve:
    'Improve this project: sharpen titles, tighten grouping, and upgrade notes where they exist. Preserve the overall shape.',
}

function baseRules(depth: Depth): string[] {
  const rules = [
    'Keep every existing node id exactly as provided.',
    'Titles must stay under 200 characters.',
    'Use only these roles: theme, main-branch, branch, leaf, task, idea, question, risk.',
    'Keep the optional "done" field (true on a finished node with role "task"). You may set "done": true on tasks that are clearly finished; never put it on other roles.',
    'Keep the optional "color" (an integer 1-8: a colour of the style preset) and "icon" (exactly one emoji) fields on the nodes that have them; add them only when they help.',
    'A line "[image: …]" (or "[image]") at the end of a node\'s notes stands for a picture on that node, which is not sent; keep that line as it is and never add such lines.',
    'Keep the optional "tags" field (up to 10 lowercase tags per node, written without "#": letters, digits, "-", "_" or "/", at most 32 characters each) on the nodes that have them; you may tag new nodes with tags already used in the project.',
  ]
  if (depth === 'titles') {
    rules.push('Only titles were provided; do not invent notes for existing nodes.')
  }
  return rules
}

const INTENT_RULES: Record<Intent, string[]> = {
  expand: [
    'Append-only: never delete, rename, or re-parent existing nodes.',
    'New nodes get fresh ids and attach under the most relevant existing node.',
    'Return only the brainstorm tree; the update document has no map field.',
  ],
  convert: [
    'Fill the map tree only; never modify or return the brainstorm tree.',
    'Assign a role to every node from the closed role set.',
    'Give first-level branches an explicit side ("left" or "right") to balance the map.',
  ],
  improve: [
    'You may rewrite titles and notes, and re-parent nodes when it clearly helps.',
    'Do not remove ideas unless they are exact duplicates.',
    'If you add cross-links ("links": { "from", "to" } map node ids), each may have an optional "label" of at most 80 characters.',
  ],
}

const BRANCH_RULES = [
  'The brainstorm given is one branch of a larger brainstorm: expand only this branch and return it as the brainstorm tree, its root keeping its id.',
]

function returnContract(intent: Intent, projectId?: string): string {
  if (intent === 'expand') {
    const source = projectId
      ? ` Set "sourceProjectId" to "${projectId}".`
      : ' Set "sourceProjectId" to the projectId from the packet.'
    return (
      'Return ONE JSON file: a brainstorm-update document (kind "brainstorm-update") with the expanded brainstorm tree and all original node ids preserved.' +
      source +
      ' Do not include a map.'
    )
  }
  // convert and improve carry the id too, so the app can put the reply into
  // the project it came from instead of adding a separate one.
  const source = projectId
    ? ` Set "sourceProjectId" to "${projectId}".`
    : ' Set "sourceProjectId" to the projectId from the packet, if there is one.'
  if (intent === 'convert') {
    return (
      'Return ONE JSON file: a template document (kind "template") whose root is the new mind map.' +
      source +
      ' Do not include the brainstorm tree.'
    )
  }
  return (
    'Return ONE JSON file: a full project document (kind "project") with both trees updated and all node ids preserved.' +
    source
  )
}

/**
 * `branchId` limits an "expand" packet to one Brainstorm branch (#146): the AI
 * gets and returns only that branch, and the import puts it back in place.
 */
export function buildPacket(
  project: Project,
  intent: Intent,
  depth: Depth,
  projectId?: string,
  branchId?: string,
): AnalysisPacket {
  const branch =
    intent === 'expand' && branchId && branchId !== project.brainstorm.id
      ? findNode(project.brainstorm, branchId)?.node
      : undefined
  const payload: AnalysisPacket['payload'] = {
    brainstorm: prepare(branch ?? project.brainstorm, depth),
  }
  if (intent === 'improve') {
    payload.map = prepare(project.map, depth)
  }

  return {
    kind: 'analysis-request',
    schemaVersion: 1,
    projectName: project.name,
    ...(projectId ? { projectId } : {}),
    intent,
    depth,
    preset: project.preset,
    payload,
    instructions: {
      goal: GOALS[intent],
      rules: [...baseRules(depth), ...INTENT_RULES[intent], ...(branch ? BRANCH_RULES : [])],
    },
    returnContract: returnContract(intent, projectId),
  }
}
