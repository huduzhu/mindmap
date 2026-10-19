import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addChild, exportVia, mapNode, newProject } from './helpers.ts'

/** Enter on the selected map node: a sibling, named and committed. */
async function addSibling(page: Page, title: string): Promise<void> {
  await page.keyboard.press('Enter')
  const input = page.locator('input.map-node-input')
  await expect(input).toBeFocused()
  await input.fill(title)
  await input.press('Enter')
  await expect(mapNode(page, title)).toBeVisible()
}

test('#148a: Ctrl+Enter ticks tasks and the parent counts them', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Order')
  await addChild(page, 'Tiles')
  await addSibling(page, 'Taps')

  // Ctrl+Enter makes a node a task, then marks it done.
  await mapNode(page, 'Tiles').click()
  await page.keyboard.press('Control+Enter')
  const tilesCheck = mapNode(page, 'Tiles').getByRole('checkbox')
  await expect(tilesCheck).toHaveAttribute('aria-checked', 'false')
  const progress = mapNode(page, 'Order').locator('.node-progress')
  await expect(progress).toHaveText('0/1')
  await page.keyboard.press('Control+Enter')
  await expect(tilesCheck).toHaveAttribute('aria-checked', 'true')
  await expect(mapNode(page, 'Tiles').locator('.map-node')).toHaveClass(/map-node-done/)
  await expect(progress).toHaveText('1/1')

  await mapNode(page, 'Taps').click()
  await page.keyboard.press('Control+Enter')
  await expect(progress).toHaveText('1/2')
  // Plain Enter still adds a sibling; Ctrl+Enter added none.
  await expect(page.locator('.react-flow__node')).toHaveCount(4)

  // The checkbox itself toggles, and each toggle is one undo step.
  await mapNode(page, 'Taps').getByRole('checkbox').click()
  await expect(progress).toHaveText('2/2')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(progress).toHaveText('1/2')
})

test('#148a: a Brainstorm task exports as a Markdown task list', async ({ page }) => {
  await newProject(page)
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  await page.getByTestId('brainstorm-add').click()
  const input = page.locator('input.outliner-input')
  await expect(input).toBeFocused()
  await input.fill('Measure the walls')
  // While typing, Ctrl+Enter saves the title and makes it a task.
  await input.press('Control+Enter')
  const row = page.locator('.outliner-row', { hasText: 'Measure the walls' })
  await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Control+Enter')
  await expect(row.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await expect(row).toHaveClass(/outliner-row-done/)

  const download = await exportVia(page, /Markdown outline/)
  const markdown = await readFile((await download.path())!, 'utf8')
  expect(markdown).toContain('- [x] Measure the walls')
})

test('#148b: colour and emoji from the node menu show on the map and in Outline', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Hot lead')

  await mapNode(page, 'Hot lead').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Colour…' }).click()
  const colours = page.getByRole('dialog', { name: 'Colour for “Hot lead”' })
  await expect(colours.getByRole('radio', { name: 'No colour' })).toBeFocused()
  // Keyboard: → moves to the first swatch, → again to the second, Enter picks it.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(colours.getByRole('radio', { name: 'Colour 2' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(colours).toHaveCount(0)
  await expect(mapNode(page, 'Hot lead').locator('.map-node')).toHaveAttribute('data-color', '2')

  await mapNode(page, 'Hot lead').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Marker…' }).click()
  const markers = page.getByRole('dialog', { name: 'Marker for “Hot lead”' })
  await markers.getByRole('radio', { name: '🔥' }).click()
  await expect(markers).toHaveCount(0)
  await expect(mapNode(page, 'Hot lead').locator('.node-icon')).toHaveText('🔥')

  // Any emoji can be typed.
  await mapNode(page, 'Hot lead').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Marker…' }).click()
  await page.getByTestId('marker-custom').fill('🚀')
  await page.keyboard.press('Enter')
  await expect(mapNode(page, 'Hot lead').locator('.node-icon')).toHaveText('🚀')

  await page.getByRole('tab', { name: 'Outline' }).click()
  const row = page.locator('.outliner-row', { hasText: 'Hot lead' })
  await expect(row.locator('.node-icon')).toHaveText('🚀')
  await expect(row.locator('.row-accent')).toBeVisible()

  // The interactive page carries both.
  const html = await readFile(
    (await (await exportVia(page, 'Interactive HTML (.html)')).path())!,
    'utf8',
  )
  expect(html).toContain('"icon":"🚀"')
  expect(html).toContain('"color":2')
})

test('#148c: double-click a cross-link to label it', async ({ page }) => {
  await newProject(page)
  // Three branches on each side; a link from the lowest left one to the lowest
  // right one runs under the central topic, clear of every node.
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']
  await addChild(page, names[0])
  for (const name of names.slice(1)) await addSibling(page, name)

  await mapNode(page, 'Foxtrot').click()
  await page.getByTestId('node-details').getByRole('button', { name: 'Link to…' }).click()
  const picker = page.getByRole('dialog', { name: 'Link “Foxtrot” to…' })
  await picker.getByRole('combobox').fill('charl')
  await page.keyboard.press('Enter')
  await expect(picker).toHaveCount(0)
  const link = page.locator('.react-flow__edge-linkEdge')
  await expect(link).toHaveCount(1)
  await expect(link).toHaveAttribute('aria-label', 'Link between “Foxtrot” and “Charlie”')

  // The middle of the curve, in page coordinates.
  const middle = await link.locator('.react-flow__edge-interaction').evaluate((element) => {
    // The e2e project has no DOM types; this is an SVGPathElement.
    const path = element as unknown as {
      getTotalLength(): number
      getPointAtLength(length: number): { x: number; y: number }
      getScreenCTM(): { a: number; b: number; c: number; d: number; e: number; f: number }
    }
    const point = path.getPointAtLength(path.getTotalLength() / 2)
    const m = path.getScreenCTM()
    return { x: point.x * m.a + point.y * m.c + m.e, y: point.x * m.b + point.y * m.d + m.f }
  })
  await page.mouse.dblclick(middle.x, middle.y)
  const prompt = page.getByRole('dialog', { name: 'Link label' })
  await expect(prompt).toBeVisible()
  await page.keyboard.type('needs')
  await page.keyboard.press('Enter')
  await expect(prompt).toHaveCount(0)
  await expect(link.locator('.react-flow__edge-text')).toHaveText('needs')
  await expect(link).toHaveAttribute('aria-label', 'Link between “Foxtrot” and “Charlie”: “needs”')
  await expect(page.getByTestId('node-links')).toContainText('needs')

  // The pill is part of the map, so the SVG export has it too.
  const svg = await readFile((await (await exportVia(page, 'SVG image')).path())!, 'utf8')
  expect(svg).toContain('needs</text>')

  // Double-clicking the label itself edits it; an empty label clears it.
  await link.locator('.react-flow__edge-textbg').dblclick()
  await expect(prompt).toBeVisible()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.keyboard.press('Enter')
  await expect(prompt).toHaveCount(0)
  await expect(link.locator('.react-flow__edge-text')).toHaveCount(0)
  // Nothing was renamed by the double-clicks.
  await expect(page.locator('input.map-node-input')).toHaveCount(0)
})
