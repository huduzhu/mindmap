import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addChild, exportVia, mapNode, newProject } from './helpers.ts'

// The production build carries a Content-Security-Policy <meta> tag (added by
// vite.config.ts from public/_headers). The app's main paths must run under it
// without a single violation: schema validation (Ajv), pictures (blob: URLs),
// image export (html-to-image: data: URLs), printing (a same-origin frame) and
// the interactive HTML export.
const RECORD = `
window.__cspViolations = []
document.addEventListener('securitypolicyviolation', (event) => {
  window.__cspViolations.push(event.effectiveDirective + ' ' + event.blockedURI)
})
window.__mmsPastePng = async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 300
  canvas.height = 200
  const context = canvas.getContext('2d')
  context.fillStyle = '#2563eb'
  context.fillRect(0, 0, 300, 200)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  const data = new DataTransfer()
  data.items.add(new File([blob], 'Policy.png', { type: 'image/png' }))
  document.body.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  )
}
`

// Strings, not functions: the e2e files are type-checked without the DOM library.
const violations = (page: Page) => page.evaluate<string[]>('window.__cspViolations')

test('the built app runs under its Content-Security-Policy', async ({ page }) => {
  await page.addInitScript({ content: RECORD })
  await newProject(page)
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /default-src 'self'.*object-src 'none'/,
  )
  await addChild(page, 'Under policy')

  // A picture: processed on a canvas, shown from a blob: URL.
  await page.evaluate('window.__mmsPastePng()')
  await expect(mapNode(page, 'Under policy').locator('img')).toBeVisible()

  // Image export through html-to-image.
  const png = await exportVia(page, 'PNG image')
  expect((await readFile((await png.path())!)).subarray(1, 4).toString()).toBe('PNG')

  // Print from the hidden frame.
  await page.getByRole('button', { name: 'Export ▾' }).click()
  await page.getByRole('menuitem', { name: 'Print / save as PDF…' }).click()
  await expect(
    page.locator('iframe.print-frame').first().contentFrame().locator('img'),
  ).toHaveAttribute('src', /^data:image\/svg\+xml/)

  // The interactive HTML export reads the viewer files and downloads one page.
  const html = await exportVia(page, /Interactive HTML \(\.html\)/)
  expect(await readFile((await html.path())!, 'utf8')).toContain('window.__MMS_DATA__')

  // A reload reopens the project, which validates it with Ajv.
  await page.reload()
  await expect(mapNode(page, 'Under policy')).toBeVisible()

  expect(await violations(page)).toEqual([])
})
