#!/usr/bin/env node
// Release packaging (#56). Replaces scripts/package-zip.ps1, which hard-coded a
// dead absolute path, ignored robocopy's exit code, wrote the zip into the tree
// it was staging, and shipped whatever stale build output was on disk.
//
// Produces two archives in release/ from a fresh dist/ (run through
// `npm run package`, which builds first):
// - mindmap-studio-<version>-<short-sha>[-dirty].zip: every tracked file
//   (git ls-files, so no node_modules, .git or ignored output) plus dist/;
// - mindmap-studio-<version>-app.zip: just the built app (dist/), with
//   LICENSE, THIRD_PARTY_NOTICES.md and README-OFFLINE.txt on how to serve it.
// Cross-platform: needs only git and Node 24 (see .nvmrc), which imports the
// shared store-only ZIP writer (src/io/zipWriter.ts) straight from its
// TypeScript source, so that file must not import anything.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipStore } from '../src/io/zipWriter.ts'

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** Repo-relative, forward-slash paths to put in the archive. */
export function collectFiles(root = ROOT) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => existsSync(path.join(root, file)))
  const distDir = path.join(root, 'dist')
  const dist = existsSync(distDir)
    ? walk(distDir).map((file) => path.relative(root, file).split(path.sep).join('/'))
    : []
  return [...new Set([...tracked, ...dist])].sort()
}

/** How to run the app from the app-only archive. */
export function offlineReadme(version) {
  return `Mind Map Studio ${version}
${'='.repeat(`Mind Map Studio ${version}`.length)}

This folder is the built app: static files that run entirely in your browser.
Your projects are stored in the browser on this computer, never uploaded.

Serve the folder with any static web server and open the address it prints,
for example (from inside this folder):

    npx serve .                  (Node.js)
    python -m http.server 8080   (Python 3; then open http://localhost:8080/)

Opening index.html directly from disk (file://) does not work: browsers block
the app's scripts and storage there.

To install the app (PWA) and use it offline, the address must be
http://localhost (or 127.0.0.1) or a site served over https://. On another
address it still runs, but cannot be installed or work offline.

Serve the folder at the root of the address, as above. For a sub-path such as
https://example.com/mindmap/, build from source with BASE_PATH=/mindmap/
(see the README in the source code).

Licence: MIT (LICENSE). Third-party licences: THIRD_PARTY_NOTICES.md.
Source code and help: https://github.com/huduzhu/mindmap
`.replace(/\n/g, '\r\n')
}

/**
 * Entries of the app-only archive: dist/ under one folder, plus licence and
 * readme. dist/.vite/ (Vite's build manifest) is a build record, not part of
 * the app, so it is left out.
 */
export function appEntries(version, root = ROOT) {
  const folder = `mindmap-studio-${version}`
  const distDir = path.join(root, 'dist')
  const buildRecord = path.join(distDir, '.vite')
  const shipped = walk(distDir).filter((file) => !file.startsWith(buildRecord + path.sep))
  const files = shipped.map((file) => ({
    name: `${folder}/${path.relative(distDir, file).split(path.sep).join('/')}`,
    data: new Uint8Array(readFileSync(file)),
  }))
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    files.push({
      name: `${folder}/${name}`,
      data: new Uint8Array(readFileSync(path.join(root, name))),
    })
  }
  files.push({
    name: `${folder}/README-OFFLINE.txt`,
    data: new TextEncoder().encode(offlineReadme(version)),
  })
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('package-zip: dist/ is missing — run `npm run package` (it builds first).')
    process.exit(1)
  }
  const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const sha = git(['rev-parse', '--short', 'HEAD'])
  const dirty = git(['status', '--porcelain']) !== ''
  const files = collectFiles()
  const entries = files.map((name) => ({
    name: `mindmap-studio/${name}`,
    data: new Uint8Array(readFileSync(path.join(ROOT, name))),
  }))
  const outDir = path.join(ROOT, 'release')
  mkdirSync(outDir, { recursive: true })
  const write = (name, archive, count) => {
    const outFile = path.join(outDir, name)
    writeFileSync(outFile, zipStore(archive))
    const kb = (statSync(outFile).size / 1024).toFixed(1)
    console.log(`package-zip: wrote ${path.relative(ROOT, outFile)} (${count} files, ${kb} KiB)`)
  }
  write(`mindmap-studio-${version}-${sha}${dirty ? '-dirty' : ''}.zip`, entries, files.length)
  const app = appEntries(version)
  write(`mindmap-studio-${version}-app.zip`, app, app.length)
}
