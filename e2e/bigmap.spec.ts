import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { canvasRenameInput, mapNode } from './helpers.ts'

/** 10 × 12 × 12 ideas under one central topic: 1,571 nodes. */
function bigProject() {
  let n = 0
  const node = (title: string, children?: object[]) => ({
    id: `n${n++}`,
    title,
    ...(children ? { children } : {}),
  })
  const range = (count: number) => Array.from({ length: count }, (_, i) => i + 1)
  return {
    kind: 'project',
    schemaVersion: 1,
    name: 'Big',
    preset: 'corporate',
    brainstorm: { id: 'b-root', title: 'Ideas' },
    map: node(
      'Big map',
      range(10).map((b) =>
        node(
          `Branch ${b}`,
          range(12).map((c) =>
            node(
              `Topic ${b}.${c}`,
              range(12).map((g) => node(`Idea ${b}.${c}.${g}`)),
            ),
          ),
        ),
      ),
    ),
  }
}

// React Flow writes the zoom into the viewport's inline transform: "translate(…) scale(z)".
const zoom = (page: import('@playwright/test').Page) =>
  page
    .locator('.react-flow__viewport')
    .evaluate((el) =>
      Number(
        /scale\(([\d.]+)\)/.exec((el as { style: { transform: string } }).style.transform)?.[1],
      ),
    )

test('#100: a big map opens at a readable zoom, on the central topic', async ({ page }, info) => {
  const file = info.outputPath('big.json')
  await writeFile(file, JSON.stringify(bigProject()))
  await page.goto('/')
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import or restore…' }).click()
  await (await choosing).setFiles(file)

  const root = mapNode(page, 'Big map')
  await expect(root).toBeInViewport()
  await expect.poll(() => zoom(page)).toBeGreaterThanOrEqual(0.6)

  // Fit View still shows the whole map, however small.
  await page.locator('.react-flow__controls-fitview').click()
  await expect.poll(() => zoom(page)).toBeLessThan(0.6)
})

test('#97: renaming on a big map works even when the node is off screen', async ({
  page,
}, info) => {
  const file = info.outputPath('big.json')
  await writeFile(file, JSON.stringify(bigProject()))
  await page.goto('/')
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import or restore…' }).click()
  await (await choosing).setFiles(file)
  await mapNode(page, 'Big map').click()

  // A new child of the central topic is laid out far from the view: it is
  // brought into view and its rename box works.
  await page.keyboard.press('Tab')
  const input = canvasRenameInput(page)
  await expect(input).toBeFocused()
  await input.fill('Far away')
  await input.press('Enter')
  await expect(mapNode(page, 'Far away')).toBeInViewport()

  // Scrolling the node out of view mid-rename keeps the rename box alive.
  await page.keyboard.press('F2')
  await expect(input).toBeFocused()
  const canvas = page.getByTestId('map-canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 4000)
  await expect(mapNode(page, 'Far away')).not.toBeInViewport()
  await input.fill('Renamed while away')
  await input.press('Enter')
  await expect(input).toHaveCount(0)
  // Keys work again afterwards.
  await page.keyboard.press('F2')
  await expect(input).toHaveValue('Renamed while away')
})

test('#100: a small map still fits the view', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await expect(mapNode(page, 'Untitled project')).toBeInViewport()
  await expect.poll(() => zoom(page)).toBe(1)
})
