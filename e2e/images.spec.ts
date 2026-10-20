import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { installFakeFolder, type SeedFile } from './fakeFolder.ts'
import { addChild, exportVia, mapNode, newProject, renameProject } from './helpers.ts'

// Embedded images (#149): paste a picture onto a node, see its thumbnail,
// open the lightbox, describe the picture, undo; drop a picture on a node.

/**
 * In-page helpers, as a script (the e2e files are type-checked without the
 * DOM library): make a PNG (opaque, or with a transparent half), paste it as
 * the browser does for a copied picture, drop it on an element, and read the
 * stored asset records from IndexedDB.
 */
const HELPERS = `
window.__mmsMakePng = async (width, height, transparent) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.fillStyle = '#2563eb'
  context.fillRect(0, 0, transparent ? width / 2 : width, height)
  context.fillStyle = '#f59e0b'
  context.fillRect(width / 4, height / 4, width / 4, height / 4)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  window.__png = new File([blob], 'Site photo.png', { type: 'image/png' })
}
window.__mmsPaste = () => {
  const data = new DataTransfer()
  data.items.add(window.__png)
  document.body.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  )
}
window.__mmsDrop = (selector) => {
  const element = document.querySelector(selector)
  const data = new DataTransfer()
  data.items.add(window.__png)
  for (const type of ['dragenter', 'dragover', 'drop'])
    element.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }))
}
window.__mmsAssets = () =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open('mindmap-studio')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const request = open.result.transaction('assets').objectStore('assets').getAll()
      request.onsuccess = () => {
        resolve(request.result.map(({ type, w, h }) => ({ type, w, h })))
        open.result.close()
      }
    }
  })
`

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: HELPERS })
})

const makePng = (page: Page, width: number, height: number, transparent = false) =>
  page.evaluate(`window.__mmsMakePng(${width}, ${height}, ${transparent})`)
const pastePng = (page: Page) => page.evaluate('window.__mmsPaste()')
const dropPng = (page: Page, selector: string) =>
  page.evaluate(`window.__mmsDrop(${JSON.stringify(selector)})`)
const storedAssets = (page: Page) =>
  page.evaluate('window.__mmsAssets()') as Promise<{ type: string; w: number; h: number }[]>

const thumb = (page: Page, title: string) => mapNode(page, title).locator('.map-node-image img')

test('paste a picture, see the thumbnail, use the lightbox, describe it, undo', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'North wall')
  const before = (await mapNode(page, 'North wall').boundingBox())!

  // A 2000×1000 screenshot is scaled to 1600×800 and stored as WebP.
  await makePng(page, 2000, 1000)
  await pastePng(page)
  await expect(thumb(page, 'North wall')).toBeVisible()
  await expect(thumb(page, 'North wall')).toHaveAttribute('src', /^blob:/)
  // The map shows the 256 px thumbnail, never the full picture.
  expect(
    await thumb(page, 'North wall').evaluate(
      (img) => (img as { naturalWidth: number }).naturalWidth,
    ),
  ).toBe(256)
  // Layout made room above the title: 220×110 plus a 4px gap.
  const after = (await mapNode(page, 'North wall').boundingBox())!
  expect(after.height - before.height).toBeGreaterThanOrEqual(95)
  expect(after.width).toBeGreaterThanOrEqual(220)
  expect(await storedAssets(page)).toEqual([{ type: 'image/webp', w: 1600, h: 800 }])

  // The lightbox: zoom keys, the description, Esc.
  await thumb(page, 'North wall').click()
  const lightbox = page.getByTestId('image-lightbox')
  await expect(lightbox).toBeVisible()
  await expect(lightbox.getByTestId('lightbox-img')).toBeVisible()
  await expect(page.getByTestId('lightbox-stage')).toBeFocused()
  await page.keyboard.press('+')
  await expect(page.getByTestId('lightbox-zoom')).toHaveText('125%')
  await page.keyboard.press('0')
  await expect(page.getByTestId('lightbox-zoom')).toHaveText('100%')
  await page.getByTestId('lightbox-stage').hover()
  await page.mouse.wheel(0, -300)
  await expect(page.getByTestId('lightbox-zoom')).not.toHaveText('100%')
  await page.getByTestId('lightbox-alt').fill('Window above the sink')
  await page.getByTestId('lightbox-alt').press('Enter')
  await page.keyboard.press('Escape')
  await expect(lightbox).toHaveCount(0)
  await expect(thumb(page, 'North wall')).toHaveAttribute('alt', 'Window above the sink')
  await expect(mapNode(page, 'North wall').locator('.map-node')).toHaveAttribute(
    'aria-label',
    /image: Window above the sink/,
  )

  // Space opens the picture of a node without children.
  await mapNode(page, 'North wall').locator('.map-node-title').click()
  await page.keyboard.press('Space')
  await expect(lightbox).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lightbox).toHaveCount(0)

  // One undo step each: the description, then the picture.
  await page.keyboard.press('Control+z')
  await expect(thumb(page, 'North wall')).toHaveAttribute('alt', '')
  await page.keyboard.press('Control+z')
  await expect(mapNode(page, 'North wall').locator('.map-node-image')).toHaveCount(0)
  // Redo needs no re-encoding: the picture is still stored.
  await page.keyboard.press('Control+Shift+z')
  await expect(thumb(page, 'North wall')).toBeVisible()
  expect(await storedAssets(page)).toHaveLength(1)
})

test('drop a picture on a node and on empty canvas; a transparent one stays PNG', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Pantry')
  await makePng(page, 300, 200, true)
  const pantryId = await mapNode(page, 'Pantry').getAttribute('data-id')
  await dropPng(page, `.react-flow__node[data-id="${pantryId}"] .map-node-title`)
  await expect(thumb(page, 'Pantry')).toBeVisible()
  expect(await storedAssets(page)).toEqual([{ type: 'image/png', w: 300, h: 200 }])

  // On empty canvas: a new node named after the file.
  await dropPng(page, '.react-flow__pane')
  await expect(thumb(page, 'Site photo')).toBeVisible()

  // The Outline shows a marker with a preview; clicking it opens the lightbox.
  await page.getByRole('tab', { name: 'Outline' }).click()
  const marker = page.locator('.row-image-marker').first()
  await marker.hover()
  await expect(page.locator('.row-image-preview img').first()).toBeVisible()
  await marker.click()
  await expect(page.getByTestId('image-lightbox')).toBeVisible()
  await page.getByTestId('lightbox-close').click()
  await expect(page.getByTestId('image-lightbox')).toHaveCount(0)
})

const ASSET_NAME = /^sha256-[0-9a-f]{64}\.webp$/

test('#149 part 2: the interactive HTML embeds the picture and its viewer shows it', async ({
  page,
}) => {
  await newProject(page)
  await renameProject(page, 'Picture page')
  await addChild(page, 'Benchtop')
  await makePng(page, 400, 300)
  await pastePng(page)
  await expect(thumb(page, 'Benchtop')).toBeVisible()

  const download = await exportVia(page, /Interactive HTML \(\.html\)/)
  const html = await readFile((await download.path())!, 'utf8')
  expect(html).toContain('data:image/webp;base64,')
  expect(html).not.toContain('blob:')

  // The page on its own, as someone opening the file would see it.
  const viewer = await page.context().newPage()
  // Vite's viewer build replaces zustand's `import.meta.env` check; the quick
  // local Bun build leaves it in, which a classic <script> cannot parse.
  await viewer.setContent(html.replaceAll('import.meta.env', 'undefined'))
  const node = viewer.locator('.react-flow__node').filter({ hasText: 'Benchtop' })
  const image = node.getByTestId('viewer-image').locator('img')
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('src', /^data:image\/webp;base64,/)
  expect(await image.evaluate((img) => (img as { naturalWidth: number }).naturalWidth)).toBe(400)
  await image.click()
  const large = viewer.getByTestId('viewer-image-view')
  await expect(large).toBeVisible()
  await viewer.keyboard.press('Escape')
  await expect(large).toHaveCount(0)
  // Presenting shows it too.
  await viewer.getByTestId('viewer-present').click()
  await viewer.keyboard.press('ArrowRight')
  await expect(
    viewer.locator('.present-stage [data-testid="viewer-image"] img').first(),
  ).toBeVisible()
  await viewer.close()
})

test('#149 part 2: Markdown and JSON "with images" exports are ZIPs with the picture', async ({
  page,
}) => {
  await newProject(page)
  await renameProject(page, 'Zip check')
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  await expect(page.getByRole('tree', { name: 'Brainstorm ideas' })).toBeFocused()
  await page.keyboard.press('Enter')
  const input = page.locator('input.outliner-input')
  await input.fill('Splashback')
  await input.press('Enter')
  await page.keyboard.press('Escape')
  await makePng(page, 300, 200)
  // On the idea's row (the first row is the Brainstorm root).
  await dropPng(page, '[data-node-section="brainstorm"][data-node-id][aria-level="2"]')
  await expect(page.locator('[data-node-section="brainstorm"] .row-image-marker')).toHaveCount(1)

  const markdown = await exportVia(page, 'Markdown with images (.zip)')
  expect(markdown.suggestedFilename()).toBe('zip-check-brainstorm.zip')
  const mdZip = (await readFile((await markdown.path())!)).toString('latin1')
  const imagePath = mdZip.match(/images\/sha256-[0-9a-f]{64}\.webp/)?.[0]
  expect(imagePath).toBeTruthy()
  expect(mdZip).toContain('zip-check-brainstorm.md')
  expect(mdZip).toContain(`![](${imagePath})`)

  const json = await exportVia(page, 'Project JSON with images (.zip)')
  const jsonZip = (await readFile((await json.path())!)).toString('latin1')
  expect(jsonZip).toContain('zip-check.mindmap.json')
  expect(jsonZip).toContain(`assets/${imagePath!.slice('images/'.length)}`)
})

test('#149 part 2: a picture syncs through _assets and arrives on the other computer', async ({
  page,
  browser,
}) => {
  await page.addInitScript(installFakeFolder)
  await newProject(page)
  await renameProject(page, 'Site visit')
  await addChild(page, 'Window')
  await makePng(page, 500, 250)
  await pastePng(page)
  await expect(thumb(page, 'Window')).toBeVisible()
  await page.getByRole('button', { name: 'Project ▾' }).click()
  await page.getByRole('menuitem', { name: 'Sync folder…' }).click()
  await page.getByTestId('sync-link').click()
  await expect(page.getByTestId('sync-dialog-status')).toContainText('Up to date')

  type Folder = {
    files: Map<string, { text: string }>
    dirs: Map<string, { files: Map<string, { bytes?: Uint8Array }> }>
  }
  const readFolder = () =>
    page.evaluate(() => {
      const g = globalThis as unknown as { __syncFolder: Folder; btoa(s: string): string }
      const folder = g.__syncFolder
      const seed: { name: string; dir?: string; text?: string; base64?: string }[] = []
      for (const [name, file] of folder.files) seed.push({ name, text: file.text })
      for (const [name, file] of folder.dirs.get('_assets')?.files ?? []) {
        let binary = ''
        for (const byte of file.bytes ?? []) binary += String.fromCharCode(byte)
        seed.push({ name, dir: '_assets', base64: g.btoa(binary) })
      }
      return seed
    })
  await expect
    .poll(async () => (await readFolder()).filter((file) => file.dir === '_assets').length)
    .toBe(1)
  const seed: SeedFile[] = await readFolder()
  expect(seed.find((file) => file.dir === '_assets')!.name).toMatch(ASSET_NAME)
  expect(seed.some((file) => file.name.endsWith('.mindmap.json'))).toBe(true)

  // The other computer: an empty browser with the same folder.
  const other = await browser.newContext()
  const laptop = await other.newPage()
  await laptop.addInitScript({ content: HELPERS })
  await laptop.addInitScript(installFakeFolder, seed)
  await laptop.goto('/')
  await laptop.getByTestId('start-sync').click()
  await laptop.getByTestId('sync-link').click()
  await expect(laptop.getByTestId('sync-dialog-status')).toContainText('Up to date')
  await expect(laptop.getByTestId('sync-images-pending')).toHaveCount(0)
  await laptop.getByTestId('sync-dialog').getByRole('button', { name: 'Close' }).click()
  await laptop
    .locator('.project-row-main')
    .getByRole('button', { name: 'Site visit', exact: true })
    .click()
  await expect(thumb(laptop, 'Window')).toBeVisible()
  await expect(thumb(laptop, 'Window')).toHaveAttribute('src', /^blob:/)
  expect(await storedAssets(laptop)).toEqual([{ type: 'image/webp', w: 500, h: 250 }])
  // The laptop does not write the picture again.
  expect(
    await laptop.evaluate(
      () =>
        (globalThis as unknown as { __syncFolder: Folder }).__syncFolder.dirs.get('_assets')!.files
          .size,
    ),
  ).toBe(1)
  await other.close()
})
