import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * H-0: English text for lazily loaded parts lives in src/i18n/en/<area>.ts and
 * reaches the page only when a module imports it. So every source file that
 * names one of those keys must import its area itself; otherwise `t` could run
 * before the table is there and show the raw key.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AREA_DIR = path.join(SRC, 'i18n', 'en')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : []
  })
}

/** Each area's keys, read from the table file. */
const areaKeys = new Map<string, string[]>(
  readdirSync(AREA_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => {
      const text = readFileSync(path.join(AREA_DIR, name), 'utf8')
      const keys = [...text.matchAll(/^ {2}'([^']+)':/gm)].map((match) => match[1])
      return [name.replace(/\.ts$/, ''), keys]
    }),
)

/** Areas a file's code refers to: whole keys, plural bases (`tn`) and `${…}` prefixes. */
function areasUsed(code: string): string[] {
  const literals = new Set(
    [...code.matchAll(/['"`]([a-zA-Z]+\.[\w.-]+)(?:['"]|`|\$\{)/g)].map((match) => match[1]),
  )
  const used: string[] = []
  for (const [area, keys] of areaKeys) {
    const hit = keys.some((key) => {
      if (literals.has(key) || literals.has(key.replace(/\.(one|other)$/, ''))) return true
      return [...literals].some((text) => text.endsWith('.') && key.startsWith(text))
    })
    if (hit) used.push(area)
  }
  return used
}

describe('lazy message areas (H-0)', () => {
  it('finds whole keys, plural bases and template prefixes', () => {
    expect(areasUsed("t('sync.title')")).toEqual(['sync'])
    expect(areasUsed("tn('snapshots.nodes', 2)")).toEqual(['snapshots'])
    expect(areasUsed('t(`sync.skip.${reason}` as const)')).toEqual(['sync'])
    expect(areasUsed("t('toolbar.home')")).toEqual([])
  })

  it('every file using an area key imports that area', () => {
    const problems: string[] = []
    for (const file of sourceFiles(SRC)) {
      if (file.startsWith(path.join(SRC, 'i18n') + path.sep)) continue
      // The HTML viewer carries its own word list (it never uses the app's t()).
      if (file.startsWith(path.join(SRC, 'viewer') + path.sep)) continue
      const code = readFileSync(file, 'utf8')
      const relative = path.relative(path.dirname(file), AREA_DIR).split(path.sep).join('/')
      for (const area of areasUsed(code)) {
        if (!code.includes(`import '${relative}/${area}'`))
          problems.push(`${path.relative(SRC, file)} needs import '${relative}/${area}'`)
      }
    }
    expect(problems).toEqual([])
  })
})
