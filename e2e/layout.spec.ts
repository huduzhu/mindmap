import { expect, test, type Page } from '@playwright/test'
import { mapNode, newProject } from './helpers.ts'

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

// Small phones in both languages (#206): every view toggle fits, nothing is clipped
// and the page never scrolls sideways.
for (const locale of ['en', 'zh-CN']) {
  for (const width of [320, 375]) {
    test.describe(`phone, ${width} px, ${locale} (#206)`, () => {
      test.use({ locale, viewport: { width, height: 700 } })

      test('the view toggles fit without sideways scrolling', async ({ page }) => {
        await page.goto('/')
        await page
          .getByRole('button', { name: locale === 'en' ? 'Start a new project' : '新建项目' })
          .click()
        await expect(page.getByTestId('tags-toggle')).toBeVisible()
        // A script string: the e2e project has no DOM types.
        const fit = await page.evaluate(`({
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          clipped: [...document.querySelectorAll('.toolbar-views .tab')]
            .filter((tab) => tab.scrollWidth > tab.clientWidth + 1 || tab.getBoundingClientRect().right > innerWidth)
            .map((tab) => tab.textContent),
        })`)
        expect(fit).toEqual({ page: 0, clipped: [] })
      })
    })
  }
}

test.describe('active toggles (#204)', () => {
  test('the active view tab and a pressed toggle use the accent', async ({ page }) => {
    await newProject(page)
    // The accent as a computed colour (a script string: no DOM types here).
    const accent = await page.evaluate<string>(`(() => {
      const probe = document.createElement('span')
      probe.style.color = 'var(--mms-accent)'
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    })()`)
    await expect(page.getByRole('tab', { name: 'Mind Map' })).toHaveCSS('background-color', accent)
    await expect(page.getByRole('tab', { name: 'Outline' })).not.toHaveCSS(
      'background-color',
      accent,
    )
    const details = page.getByTestId('details-toggle')
    if ((await details.getAttribute('aria-pressed')) !== 'true') await details.click()
    await expect(details).toHaveAttribute('aria-pressed', 'true')
    await expect(details).toHaveCSS('background-color', accent)
  })
})

test.describe('touch phone (#210)', () => {
  test.use({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true })

  test('a toast sits above the touch action bar', async ({ page }) => {
    await newProject(page)
    await mapNode(page, 'Untitled project').tap()
    const bar = page.getByTestId('touch-bar')
    await expect(bar).toBeVisible()
    // Any toast: the position comes from the stylesheet alone.
    await page.evaluate(`(() => {
      const toast = document.createElement('div')
      toast.className = 'toast toast-info'
      toast.textContent = 'Saved'
      document.body.append(toast)
    })()`)
    const toastBox = await page.locator('.toast').boundingBox()
    const barBox = await bar.boundingBox()
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(barBox!.y)
  })
})
