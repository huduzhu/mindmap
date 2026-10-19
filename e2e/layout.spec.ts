import { expect, test, type Page } from '@playwright/test'
import { newProject } from './helpers.ts'

/** Rows the toolbar wraps onto: controls whose vertical centres are more than 12 px apart. */
async function toolbarRows(page: Page): Promise<number> {
  const boxes = await page
    .locator('header.toolbar')
    .locator('button:visible, input:visible, [role="status"]:visible')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = (
          element as unknown as { getBoundingClientRect(): { top: number; height: number } }
        ).getBoundingClientRect()
        return box.top + box.height / 2
      }),
    )
  const centres = [...boxes].sort((a, b) => a - b)
  let rows = 0
  let last = -Infinity
  for (const centre of centres) {
    if (centre - last > 12) rows += 1
    last = centre
  }
  return rows
}

test.describe('desktop, 1280 px (#76)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the toolbar fits on two rows', async ({ page }) => {
    await newProject(page)
    expect(await toolbarRows(page)).toBeLessThanOrEqual(2)
    await expect(page.getByRole('button', { name: 'More actions' })).toBeHidden()
    await expect(page.locator('.react-flow__minimap')).toBeVisible()
  })
})

test.describe('phone, 390 px (#76, #80)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the toolbar takes at most a fifth of the screen; ⋯ reveals the rest', async ({ page }) => {
    await newProject(page)
    expect(await toolbarRows(page)).toBeLessThanOrEqual(2)
    const header = await page.locator('header.toolbar').boundingBox()
    expect(header!.height).toBeLessThanOrEqual(844 * 0.2)
    await expect(page.getByRole('button', { name: 'Project ▾' })).toBeHidden()
    await expect(page.getByRole('tab', { name: 'Outline' })).toBeVisible()

    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('button', { name: 'Project ▾' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export ▾' })).toBeVisible()
    await page.getByRole('button', { name: 'Fewer actions' }).click()
    await expect(page.getByRole('button', { name: 'Project ▾' })).toBeHidden()
  })

  test('the minimap starts hidden and the hint bar stays on one line', async ({ page }) => {
    await newProject(page)
    await expect(page.locator('.react-flow__minimap')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show map overview' }).click()
    await expect(page.locator('.react-flow__minimap')).toBeVisible()

    const hint = page.locator('.canvas-hint')
    const box = await hint.boundingBox()
    expect(box!.height).toBeLessThan(36)
    await hint.getByRole('button', { name: 'Keyboard shortcuts' }).click()
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  })
})
