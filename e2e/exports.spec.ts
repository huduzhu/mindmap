import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { exportVia, newProject, renameProject } from './helpers.ts'

test('#51: a CJK project name survives into the export filename', async ({ page }) => {
  await newProject(page)
  await renameProject(page, '产品路线图')
  const download = await exportVia(page, /Project JSON/)
  expect(download.suggestedFilename()).toBe('产品路线图.mindmap.json')
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(saved.name).toBe('产品路线图')
})

test('#55/#67: Interactive HTML export works from the built app', async ({ page }) => {
  await newProject(page)
  await renameProject(page, 'Viewer check')
  const download = await exportVia(page, /Interactive HTML \(\.html\)/)
  expect(download.suggestedFilename()).toBe('viewer-check.html')
  const html = await readFile((await download.path())!, 'utf8')
  expect(html).toContain('window.__MMS_DATA__')
  expect(html).toContain('Viewer check')
})
