import type { Depth, Intent, Role, Side } from './constants'

/**
 * Optional fields that the editor clears by writing `undefined` (rather than
 * deleting the key) accept it explicitly; JSON and the schema treat both alike.
 */
export interface TreeNode {
  id: string
  title: string
  notes?: string | undefined
  side?: Side | undefined
  role?: Role | undefined
  collapsed?: boolean | undefined
  /** Task done state (#148a); only shown when `role` is 'task'. */
  done?: boolean
  /** Colour marker (#148b): 1-based slot in the preset's `palette.branchColors`. */
  color?: number
  /** Emoji marker (#148b): exactly one emoji, shown before the title. */
  icon?: string
  /** Node tags (#150): without `#`, lowercase, 1–32 characters, at most 10. Format 3. */
  tags?: string[]
  /** Embedded image (#149): bytes kept outside the project by content hash. Format 4. */
  image?: NodeImage
  children?: TreeNode[] | undefined
}

/** An image on a node (#149); the bytes live in the asset store under `asset`. */
export interface NodeImage {
  /** `sha256-<64 hex>` of the stored bytes. */
  asset: string
  /** Stored size in pixels, each side 1–1600. */
  w: number
  h: number
  /** Text for screen readers, at most 300 characters. */
  alt?: string
}

export interface PresetPalette {
  background: string
  text: string
  mutedText: string
  nodeFill: string
  nodeBorder: string
  edge: string
  branchColors: string[]
}

export interface PresetRoleStyle {
  fill?: string
  text?: string
  border?: string
  fontWeight?: 'normal' | 'bold'
  shape?: 'rounded' | 'pill' | 'box'
}

export interface Preset {
  kind: 'preset'
  schemaVersion: 1
  name: string
  palette: PresetPalette
  roles: Partial<Record<Role, PresetRoleStyle>>
  font: { family: string; baseSize: number; titleScale: number }
  edges: { curve: 'smoothstep' | 'bezier' | 'straight'; width: number; dashed: boolean }
}

export type PresetRef = string | { inline: Preset }

export interface NodeLink {
  from: string
  to: string
  /** Shown at the middle of the link (#148c); 1–80 characters. */
  label?: string
}

export interface Project {
  kind: 'project'
  schemaVersion: 1
  /** Set on an AI "improve" reply: the library project it came from (never stored). */
  sourceProjectId?: string
  name: string
  preset: PresetRef
  brainstorm: TreeNode
  map: TreeNode
  links?: NodeLink[] | undefined
  pinned?: boolean
  tags?: string[] | undefined
  updatedAt?: string
  /** File-format metadata written by newer app versions (GE0a); stripped on read. */
  app?: { minVersion?: number }
}

export interface Template {
  kind: 'template'
  schemaVersion: 1
  /** Set on an AI "convert" reply: the library project whose map it is for. */
  sourceProjectId?: string
  name: string
  preset: PresetRef
  root: TreeNode
}

export interface PacketInstructions {
  goal: string
  rules: string[]
}

export interface AnalysisPacket {
  kind: 'analysis-request'
  schemaVersion: 1
  projectName: string
  projectId?: string
  intent: Intent
  depth: Depth
  preset: PresetRef
  payload: { brainstorm?: TreeNode; map?: TreeNode }
  instructions: PacketInstructions
  returnContract?: string
}

export interface BrainstormUpdate {
  kind: 'brainstorm-update'
  schemaVersion: 1
  sourceProjectId: string
  name: string
  preset: PresetRef
  brainstorm: TreeNode
}

export type Document = Preset | Project | Template | AnalysisPacket | BrainstormUpdate
