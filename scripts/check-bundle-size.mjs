#!/usr/bin/env node
// Bundle budget (#88, L4). Sums the JavaScript a first visit must download
// before the app can start — the entry chunk plus everything it imports
// statically, as listed in Vite's build manifest — and fails when that grows
// past the budget. Lazily loaded chunks (exporters, the precompiled schema
// validators, dialogs, the guide) are listed but do not count. Gzip sizes are printed next to the
// raw ones for comparison (H0-3); the budget is on raw bytes.
//
//   npm run build && npm run size
//   BUNDLE_BUDGET_KB=520 npm run size   # try a different budget
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

// CI measured 522.8 KB after the follow-up batch (merge 1a6d98b); the owner
// asked for 10% headroom: 522.8 × 1.10 ≈ 575 KB. Raise it only on purpose,
// with the reason in the commit.
export const DEFAULT_BUDGET_KB = 575

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Files reachable from the entry through static imports, and the lazy rest. */
export function initialChunks(manifest) {
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry)
  if (entries.length === 0) throw new Error('the build manifest has no entry chunk')
  const initial = new Set()
  const stack = entries.map(([key]) => key)
  while (stack.length > 0) {
    const key = stack.pop()
    const chunk = manifest[key]
    if (!chunk || initial.has(chunk.file)) continue
    initial.add(chunk.file)
    stack.push(...(chunk.imports ?? []))
  }
  const lazy = Object.values(manifest)
    .map((chunk) => chunk.file)
    .filter((file) => file.endsWith('.js') && !initial.has(file))
  return { initial: [...initial].filter((file) => file.endsWith('.js')), lazy: [...new Set(lazy)] }
}

/** Raw and gzip byte counts of one file's contents (H0-3). */
export function measure(contents) {
  return { raw: contents.length, gzip: gzipSync(contents).length }
}

/** "  12.3 KB raw   4.5 KB gzip": both sizes, raw first since it is budgeted. */
export function sizeColumns({ raw, gzip }) {
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
  return `${kb(raw).padStart(10)} raw ${kb(gzip).padStart(10)} gzip`
}

function main() {
  const dist = path.join(ROOT, 'dist')
  const manifestPath = path.join(dist, '.vite', 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error(`No ${path.relative(ROOT, manifestPath)} — run \`npm run build\` first.`)
    process.exit(2)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const { initial, lazy } = initialChunks(manifest)
  const sizes = new Map(
    [...initial, ...lazy].map((file) => [file, measure(readFileSync(path.join(dist, file)))]),
  )
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
  const budgetKb = Number(process.env.BUNDLE_BUDGET_KB || DEFAULT_BUDGET_KB)

  const total = { raw: 0, gzip: 0 }
  console.log('Loaded at start:')
  for (const file of initial) {
    total.raw += sizes.get(file).raw
    total.gzip += sizes.get(file).gzip
    console.log(`  ${sizeColumns(sizes.get(file))}  ${file}`)
  }
  console.log('Loaded on demand:')
  for (const file of lazy.sort((a, b) => sizes.get(b).raw - sizes.get(a).raw)) {
    console.log(`  ${sizeColumns(sizes.get(file))}  ${file}`)
  }
  console.log(
    `Initial JavaScript: ${kb(total.raw)} raw, ${kb(total.gzip)} gzip (budget ${budgetKb} KB raw)`,
  )
  if (total.raw > budgetKb * 1024) {
    console.error(
      `Over budget by ${kb(total.raw - budgetKb * 1024)}. Lazy-load the new code, or raise ` +
        'DEFAULT_BUDGET_KB in scripts/check-bundle-size.mjs deliberately.',
    )
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
