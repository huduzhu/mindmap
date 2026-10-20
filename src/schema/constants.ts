export const ROLES = [
  'theme',
  'main-branch',
  'branch',
  'leaf',
  'task',
  'idea',
  'question',
  'risk',
] as const
export type Role = (typeof ROLES)[number]

export const SIDES = ['left', 'right', 'auto'] as const
export type Side = (typeof SIDES)[number]

export const INTENTS = ['expand', 'convert', 'improve'] as const
export type Intent = (typeof INTENTS)[number]

export const DEPTHS = ['titles', 'full'] as const
export type Depth = (typeof DEPTHS)[number]

export const SCHEMA_VERSION = 1

/** Longest node notes, as in schemas/tree-node.schema.json (re-exported by io/sanitize). */
export const MAX_NOTES_LENGTH = 20000
