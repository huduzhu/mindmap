// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appEntries, offlineReadme } from '../../scripts/package-zip.mjs'

let dir: string | null = null
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('release packaging', () => {
  it('the app-only archive holds dist/, the licences and the offline readme', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'mms-package-'))
    mkdirSync(path.join(dir, 'dist', 'assets'), { recursive: true })
    writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html>')
    writeFileSync(path.join(dir, 'dist', 'assets', 'main.js'), '')
    writeFileSync(path.join(dir, 'LICENSE'), 'MIT')
    writeFileSync(path.join(dir, 'THIRD_PARTY_NOTICES.md'), '# notices')
    writeFileSync(path.join(dir, 'README.md'), 'not shipped')
    expect(appEntries('1.2.3', dir).map((entry) => entry.name)).toEqual([
      'mindmap-studio-1.2.3/assets/main.js',
      'mindmap-studio-1.2.3/index.html',
      'mindmap-studio-1.2.3/LICENSE',
      'mindmap-studio-1.2.3/README-OFFLINE.txt',
      'mindmap-studio-1.2.3/THIRD_PARTY_NOTICES.md',
    ])
  })

  it('explains how to serve the app and when it can be installed', () => {
    const text = offlineReadme('1.0.0')
    expect(text).toContain('Mind Map Studio 1.0.0')
    expect(text).toContain('npx serve')
    expect(text).toContain('python -m http.server')
    expect(text).toContain('localhost')
    expect(text).toContain('https://')
  })
})
