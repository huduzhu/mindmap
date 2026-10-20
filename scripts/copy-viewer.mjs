import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const srcDir = path.join(ROOT, 'dist-viewer')
const destDir = path.join(ROOT, 'public', 'viewer')

await mkdir(destDir, { recursive: true })
await copyFile(path.join(srcDir, 'viewer.iife.js'), path.join(destDir, 'viewer.iife.js'))

const files = await readdir(srcDir)
const cssFiles = files.filter((f) => f.endsWith('.css'))
if (cssFiles.length !== 1) {
  throw new Error(
    `Expected exactly one CSS file in dist-viewer, found ${cssFiles.length}: ${JSON.stringify(cssFiles)}`,
  )
}
await copyFile(path.join(srcDir, cssFiles[0]), path.join(destDir, 'viewer.css'))
console.log('viewer assets copied to public/viewer/')
