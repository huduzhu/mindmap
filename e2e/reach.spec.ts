import { devices, expect, test } from '@playwright/test'
import { exportVia, mapNode, newProject } from './helpers.ts'

test.describe('Simplified Chinese (#89)', () => {
  test.use({ locale: 'zh-CN' })

  test('a Chinese browser gets the Chinese interface; the choice can be changed', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await page.getByRole('button', { name: '新建项目' }).click()
    await expect(page.getByRole('button', { name: '项目 ▾' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '导图' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('save-status')).toHaveText(/已保存|未保存|正在保存…/)

    await page.getByRole('button', { name: '主页' }).click()
    await page.getByRole('combobox', { name: /语言/ }).selectOption('en')
    await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
  })
})

test.describe('touch editing on a phone (#91)', () => {
  const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7']
  test.use(pixel)

  test('the action bar, long-press and double-tap edit the map', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Start a new project' }).tap()
    const bar = page.getByRole('toolbar', { name: 'Node actions' })
    await expect(bar).toBeVisible()
    // Keyboard hints are for keyboards.
    await expect(page.locator('.canvas-hint')).toBeHidden()

    await bar.getByRole('button', { name: 'Add a child to Untitled project' }).tap()
    const input = page.locator('input.map-node-input')
    await expect(input).toBeFocused()
    await input.fill('Touched')
    await input.press('Enter')
    await expect(mapNode(page, 'Touched')).toBeVisible()

    // Long-press opens the node menu.
    const node = page.getByRole('group', { name: /^Touched, level 1/ })
    const box = (await node.boundingBox())!
    const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }
    await node.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, ...at })
    await page.waitForTimeout(700)
    await node.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, ...at })
    await expect(page.getByRole('menu', { name: 'Node actions' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: 'Node actions' })).toHaveCount(0)

    // Double-tap renames.
    await node.tap()
    await node.tap()
    await expect(page.locator('input.map-node-input')).toBeFocused()
    await page.locator('input.map-node-input').press('Escape')

    await bar.getByRole('button', { name: 'Delete Touched' }).tap()
    await expect(mapNode(page, 'Touched')).toHaveCount(0)
  })

  test('Brainstorm ideas can be nested and reordered with the row buttons (#95)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Start a new project' }).tap()
    await page.getByRole('tab', { name: 'Brainstorm' }).tap()
    const bar = page.getByRole('toolbar', { name: 'Idea actions' })
    await expect(bar).toBeVisible()

    await bar.getByTestId('row-action-add').tap()
    const input = page.locator('input.outliner-input')
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await expect(input).toBeFocused()
      await input.fill(title)
      await input.press('Enter')
    }
    await input.press('Escape')
    const titles = page.locator('.outliner-title')
    await expect(titles).toHaveText([/.+/, 'Alpha', 'Beta', 'Gamma'])

    // One tap selects Beta and shows its buttons (no rename box).
    await page.locator('.outliner-row', { hasText: 'Beta' }).tap()
    await expect(input).toHaveCount(0)
    await bar.getByRole('button', { name: 'Indent Beta under the idea above' }).tap()
    const indent = (title: string) =>
      page
        .locator('.outliner-row', { hasText: title })
        .evaluate((row) =>
          parseFloat((row as { style: { paddingLeft: string } }).style.paddingLeft),
        )
    expect(await indent('Beta')).toBeGreaterThan(await indent('Alpha'))
    await bar.getByRole('button', { name: 'Outdent Beta' }).tap()
    expect(await indent('Beta')).toBe(await indent('Alpha'))

    await bar.getByRole('button', { name: 'Move Beta up' }).tap()
    await expect(titles).toHaveText([/.+/, 'Beta', 'Alpha', 'Gamma'])
    await bar.getByRole('button', { name: 'Delete Beta' }).tap()
    await expect(titles).toHaveText([/.+/, 'Alpha', 'Gamma'])
  })
})

test.describe('lazily loaded parts work offline (#88)', () => {
  // Needs `vite preview` with its service worker; a plain static server has none.
  test.skip(Boolean(process.env.E2E_BASE_URL), 'needs the built app with its service worker')
  test.use({ serviceWorkers: 'allow' })

  test('guide, importer, dialogs and exporters load with the network off', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await page.evaluate(async () => {
      const nav = globalThis.navigator as unknown as {
        serviceWorker: { ready: Promise<unknown>; controller?: unknown }
      }
      await nav.serviceWorker.ready
    })
    await page.reload()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const nav = globalThis.navigator as unknown as {
            serviceWorker: { ready: Promise<unknown>; controller?: unknown }
          }
          return Boolean(nav.serviceWorker.controller)
        }),
      )
      .toBe(true)

    await context.setOffline(true)
    await page.reload()
    await page.getByRole('button', { name: 'Try the guide · 入门指南' }).click()
    await expect(mapNode(page, 'Getting started · 入门指南')).toBeVisible()

    await page.getByRole('button', { name: 'Presets' }).click()
    await expect(page.getByRole('dialog', { name: 'Presets' })).toBeVisible()
    await page.keyboard.press('Escape')

    const download = await exportVia(page, 'PNG image')
    expect(download.suggestedFilename()).toMatch(/\.png$/)
    await context.setOffline(false)
  })
})

test('#88: an import loads the importer on demand', async ({ page }) => {
  await newProject(page)
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Try the guide · 入门指南' }).click()
  await expect(mapNode(page, 'Getting started · 入门指南')).toBeVisible()
})
