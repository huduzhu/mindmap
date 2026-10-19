import type { Preset, Project, AnalysisPacket, TreeNode } from '../schema/types'

export type TreeNodeOptions = Partial<
  Pick<
    TreeNode,
    'notes' | 'role' | 'side' | 'collapsed' | 'done' | 'color' | 'icon' | 'tags' | 'image'
  >
>

export function makeTree(
  id: string,
  title: string,
  children: TreeNode[] = [],
  options: TreeNodeOptions = {},
): TreeNode {
  return {
    id,
    title,
    children,
    ...options,
  }
}

export function makePreset(name = 'default'): Preset {
  return {
    kind: 'preset',
    schemaVersion: 1,
    name,
    palette: {
      background: '#ffffff',
      text: '#1f2937',
      mutedText: '#6b7280',
      nodeFill: '#f8fafc',
      nodeBorder: '#cbd5e1',
      edge: '#94a3b8',
      branchColors: ['#6366f1'],
    },
    roles: {},
    font: { family: 'system-ui', baseSize: 14, titleScale: 1.4 },
    edges: { curve: 'bezier', width: 1.5, dashed: false },
  }
}

export function makeProject(
  name: string,
  brainstorm?: TreeNode,
  map?: TreeNode,
  preset = 'default',
): Project {
  return {
    kind: 'project',
    schemaVersion: 1,
    name,
    preset,
    brainstorm: brainstorm || { id: 'b-root', title: 'Ideas', children: [] },
    map: map || { id: 'm-root', title: name, children: [] },
  }
}

export function makePacket(
  projectName: string,
  intent: 'expand' | 'improve',
  depth: 'titles' | 'full',
  payload: { brainstorm?: TreeNode; map?: TreeNode },
): AnalysisPacket {
  return {
    kind: 'analysis-request',
    schemaVersion: 1,
    projectName,
    intent,
    depth,
    preset: 'default',
    payload,
    instructions: {
      goal: 'Test goal',
      rules: ['Test rule'],
    },
  }
}
