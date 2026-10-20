/**
 * Text measurement for map node sizing (#72).
 *
 * Node boxes used to be sized by guessing 0.55 em per character, which is far
 * too narrow for CJK (≈1 em) and wide Latin capitals (≈0.85 em). The box then
 * clipped the text or wrapped it mid-word. Nodes are now sized from real glyph
 * widths measured on a canvas in the same font the node renders with, and lines
 * are broken the same way the CSS breaks them.
 */

/** Width in CSS pixels of `text` rendered in the CSS font shorthand `font`. */
export type MeasureText = (text: string, font: string) => number

type Context2D = { font: string; measureText: (text: string) => { width: number } }

let sharedContext: Context2D | null | undefined

function isJsdom(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
}

function canvasContext(): Context2D | null {
  if (sharedContext !== undefined) return sharedContext
  sharedContext = null
  // jsdom has no canvas and logs "not implemented" if asked; use the estimate.
  if (isJsdom()) return sharedContext
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      sharedContext = new OffscreenCanvas(1, 1).getContext('2d') as Context2D | null
    } else if (typeof document !== 'undefined') {
      sharedContext = document.createElement('canvas').getContext('2d') as Context2D | null
    }
  } catch {
    sharedContext = null
  }
  return sharedContext
}

// East Asian wide characters, fullwidth forms and emoji: about 1 em each.
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

function charEm(ch: string): number {
  if (WIDE.test(ch)) return 1
  if (ch === ' ') return 0.28
  if ('WM@'.includes(ch)) return 0.92
  if ('mw'.includes(ch)) return 0.8
  if ("iljtf!|.,:;'`".includes(ch)) return 0.3
  if ('r()[]{}-'.includes(ch)) return 0.36
  if (/[A-Z]/.test(ch)) return 0.68
  if (/[0-9]/.test(ch)) return 0.56
  return 0.54
}

/**
 * Conservative width estimate used where no canvas exists (tests, SSR). It
 * errs slightly wide so a node is never sized smaller than its text.
 */
export function estimateTextWidth(text: string, font: string): number {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 14)
  const bold = /\b(bold|[6-9]00)\b/.test(font) ? 1.07 : 1
  let em = 0
  for (const ch of text) em += charEm(ch)
  return em * size * bold
}

const CACHE_LIMIT = 5000
const cache = new Map<string, number>()

/** Measure with the canvas when available, otherwise estimate. Cached. */
export const measureText: MeasureText = (text, font) => {
  const key = `${font}\u0000${text}`
  const hit = cache.get(key)
  if (hit !== undefined) {
    // Refresh recency for the simple LRU.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const context = canvasContext()
  let width: number
  if (context) {
    context.font = font
    width = context.measureText(text).width
  } else {
    width = estimateTextWidth(text, font)
  }
  cache.set(key, width)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return width
}

const CJK_BREAKABLE = WIDE

/**
 * Split `text` into tokens that may not be broken: runs of non-space,
 * non-wide characters (words), single wide characters, and spaces.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = []
  let word = ''
  for (const ch of text) {
    if (ch === ' ' || CJK_BREAKABLE.test(ch)) {
      if (word) tokens.push(word)
      word = ''
      tokens.push(ch)
    } else {
      word += ch
    }
  }
  if (word) tokens.push(word)
  return tokens
}

/**
 * Break `text` into lines no wider than `maxWidth`, the way the node's CSS
 * (`overflow-wrap: break-word`) does: at spaces, between CJK characters, and
 * inside a word only when that word alone is wider than a line.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  font: string,
  measure: MeasureText = measureText,
): string[] {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return ['']
  const lines: string[] = []
  let line = ''
  const push = () => {
    lines.push(line.trimEnd())
    line = ''
  }
  for (const token of tokenize(flat)) {
    if (token === ' ') {
      if (line) line += ' '
      continue
    }
    const candidate = line + token
    if (measure(candidate.trimEnd(), font) <= maxWidth) {
      line = candidate
      continue
    }
    if (line.trim()) push()
    if (measure(token, font) <= maxWidth) {
      line = token
      continue
    }
    // A single word wider than the line: break it by characters.
    for (const ch of token) {
      if (line && measure(line + ch, font) > maxWidth) push()
      line += ch
    }
  }
  if (line.trim() || lines.length === 0) push()
  return lines
}
