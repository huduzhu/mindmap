import { writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { mapNode } from './helpers.ts'

// Ctrl/Cmd+F finds any node (#147). The map only renders the nodes in view,
// so the browser's own Find cannot see most of a big map.

/** 6 branches × 7 topics × 6 ideas under one central topic: 301 nodes. */
function project() {
  const range = (count: number) => Array.from({ length: count }, (_, i) => i + 1)
  const title = (b: number, c: number, g: number) =>
    b === 6 && c === 1 && g === 1
      ? 'Zebra one'
      : b === 6 && c === 7 && g === 6
        ? 'Zebra two'
        : `Idea ${b}.${c}.${g}`
  return {
    kind: 'project',
    schemaVersion: 1,
    name: 'Find',
    preset: 'default',
    brainstorm: { id: 'b-root', title: 'Ideas' },
    map: {
      id: 'root',
      title: 'Find map',
      children: range(6).map((b) => ({
        id: `b${b}`,
        title: `Branch ${b}`,
        // The last branch is folded: finding a node inside it unfolds the path.
        ...(b === 6 ? { collapsed: true } : {}),
        children: range(7).map((c) => ({
          id: `t${b}.${c}`,
          title: `Topic ${b}.${c}`,
          children: range(6).map((g) => ({ id: `i${b}.${c}.${g}`, title: title(b, c, g) })),
        })),
      })),
    },
  }
}

async function openProject(page: Page, file: string) {
  await writeFile(file, JSON.stringify(project()))
  await page.goto('/')
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import or restore…' }).click()
  await (await choosing).setFiles(file)
  await expect(mapNode(page, 'Find map')).toBeInViewport()
}

test('Ctrl+F, a word of an off-screen node, Enter: it is selected and shown', async ({
  page,
}, info) => {
  await openProject(page, info.outputPath('find.json'))
  await expect(mapNode(page, 'Zebra two')).toHaveCount(0)

  await page.getByTestId('map-canvas').focus()
  await page.keyboard.press('ControlOrMeta+f')
  const box = page.getByTestId('studio-search')
  await expect(box).toBeFocused()
  await page.keyboard.type('zebra')
  await expect(page.getByTestId('search-count')).toHaveText('1 of 2')
  await expect(mapNode(page, 'Zebra one')).toBeInViewport()

  await page.keyboard.press('Enter')
  await expect(page.getByTestId('search-count')).toHaveText('2 of 2')
  const two = mapNode(page, 'Zebra two')
  await expect(two).toBeInViewport()
  await expect(two).toHaveClass(/selected/)
  await expect(page.getByTestId('node-details-title')).toHaveText('Zebra two')

  await page.keyboard.press('Shift+Enter')
  await expect(page.getByTestId('search-count')).toHaveText('1 of 2')
  await expect(mapNode(page, 'Zebra one')).toBeInViewport()

  // Ctrl+F again selects the text, ready for a new search; Esc goes back to the map.
  await page.getByTestId('map-canvas').focus()
  await page.keyboard.press('ControlOrMeta+f')
  await expect(box).toBeFocused()
  const selected = await box.evaluate((el) => {
    const input = el as { selectionStart: number | null; selectionEnd: number | null }
    return [input.selectionStart, input.selectionEnd]
  })
  expect(selected).toEqual([0, 5])
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('map-canvas')).toBeFocused()
  // The keyboard works on the found node straight away.
  await page.keyboard.press('Tab')
  await expect(page.locator('input.map-node-input')).toBeFocused()
})

test('Enter in the search box selects the row in the Outline view', async ({ page }, info) => {
  await openProject(page, info.outputPath('find-outline.json'))
  await page.getByRole('tab', { name: 'Outline' }).click()
  await page.keyboard.press('ControlOrMeta+f')
  await expect(page.getByTestId('studio-search')).toBeFocused()
  await page.keyboard.type('zebra')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('search-count')).toHaveText('2 of 2')
  const row = page.getByTestId('outline-row-i6.7.6')
  await expect(row).toHaveAttribute('aria-selected', 'true')
  await expect(row).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('outline-view')).toBeFocused()
})
