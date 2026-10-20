/**
 * File names and content fingerprints for the sync folder (#108, plan §0a-2, §0a-6).
 */
import type { Project } from '../schema/types'

export const FILE_SUFFIX = '.mindmap.json'
export const TRASH_DIR = '_trash'
export const PRESETS_DIR = '_presets'
/** Longest project-name part of a file name (OneDrive limits whole paths). */
export const MAX_NAME_CHARS = 120

const FORBIDDEN = /[<>:"/\\|?*]/g
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** A project name made safe as a Windows file name: forbidden characters become "-". */
export function safeFileStem(name: string): string {
  // Replace Windows-forbidden characters and ASCII control characters (0-31)
  let stem = Array.from(name)
    .map((ch) => (ch.charCodeAt(0) < 32 ? '-' : ch))
    .join('')
    .replace(FORBIDDEN, '-')
    .replace(/\s+/g, ' ')
    .trim()
  stem = Array.from(stem).slice(0, MAX_NAME_CHARS).join('')
  stem = stem.replace(/[. ]+$/, '')
  if (!stem || RESERVED.test(stem)) stem = 'Untitled'
  return stem
}

/** `<safe name> (<id>).mindmap.json` — the id lets every PC match the file. */
export function fileNameFor(name: string, id: string): string {
  return `${safeFileStem(name)} (${id})${FILE_SUFFIX}`
}

// Project ids are nanoid(10). OneDrive puts its "-PCNAME" or " - Copy" suffix
// before the *last* extension, so the id is matched anywhere in a .json name.
const ID_IN_NAME = /\(([A-Za-z0-9_-]{10})\)/g

/** The project id in a sync file's name, or null for anything that is not one of ours. */
export function idFromFileName(fileName: string): string | null {
  if (!/\.json$/i.test(fileName) || fileName.startsWith('.') || fileName.startsWith('~')) {
    return null
  }
  const matches = [...fileName.matchAll(ID_IN_NAME)]
  return matches.length > 0 ? matches[matches.length - 1][1] : null
}

/** JSON with object keys sorted, so equal content always gives equal text. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return inner
    return Object.fromEntries(
      Object.entries(inner as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    )
  })
}

/** cyrb53: a fast 53-bit string hash, as 14 hex digits. */
function hash53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/**
 * A fingerprint of what the user made: the project without its save time, so
 * saving the same content again does not count as a change.
 */
export function projectHash(project: Project): string {
  // The file-format block (GE0a) describes the file, not the content.
  const { updatedAt: _updatedAt, sourceProjectId: _source, app: _app, ...content } = project
  return hash53(canonicalJson(content))
}

export function textHash(text: string): string {
  return hash53(text)
}
