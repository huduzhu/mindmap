#!/usr/bin/env node
// Make sure public/viewer/ holds a current viewer bundle before the dev server
// starts. public/viewer is git-ignored build output, so on a fresh clone
// `npm run dev` used to serve no viewer and Export → Interactive HTML failed
// with two 404s (#55). Rebuilds only when the bundle is missing or older than
// anything under src/ (the viewer imports shared modules from across src/).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export const VIEWER_OUTPUTS = ['viewer.iife.js', 'viewer.css']

function newestMtime(dir) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const mtime = entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs
    if (mtime > newest) newest = mtime
  }
  return newest
}

/** True when public/viewer is missing a file or older than the sources. */
export function viewerIsStale(root = ROOT) {
  const outDir = path.join(root, 'public', 'viewer')
  const outputs = VIEWER_OUTPUTS.map((name) => path.join(outDir, name))
  if (!outputs.every((file) => existsSync(file))) return true
  const oldestOutput = Math.min(...outputs.map((file) => statSync(file).mtimeMs))
  const sources = Math.max(
    newestMtime(path.join(root, 'src')),
    statSync(path.join(root, 'viewer.config.ts')).mtimeMs,
  )
  return sources > oldestOutput
}

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

export function ensureViewer(root = ROOT) {
  if (!viewerIsStale(root)) return false
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(vite)) {
    console.error('ensure-viewer: node_modules/vite is missing — run `npm install` first.')
    process.exit(1)
  }
  console.log(
    'ensure-viewer: building the interactive-HTML viewer (public/viewer is missing or stale)…',
  )
  run([vite, 'build', '--config', path.join(root, 'viewer.config.ts')])
  run([path.join(root, 'scripts', 'copy-viewer.mjs')])
  return true
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureViewer()
}
