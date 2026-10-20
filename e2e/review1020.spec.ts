import { expect, test, type Page } from '@playwright/test'
import { addChild, canvasRenameInput, mapNode, newProject } from './helpers.ts'

/** Enter on the selected map node: a sibling, named and committed. */
async function addSibling(page: Page, title: string): Promise<void> {
  await page.keyboard.press('Enter')
  const input = canvasRenameInput(page)
  await expect(input).toBeFocused()
  await input.fill(title)
  await input.press('Enter')
  await expect(mapNode(page, title)).toBeVisible()
}

test('#193: a search does not cancel naming a new node that matches it', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'First idea')
  await addSibling(page, 'Second')
  const search = page.getByTestId('studio-search')
  await search.fill('idea')
  await expect(page.getByTestId('search-count')).toHaveText('1 of 1')

  await mapNode(page, 'Second').click()
  await page.keyboard.press('Tab')
  const input = canvasRenameInput(page)
  await expect(input).toBeFocused()
  // "New idea" matches too; the rename stays open and the selection stays put.
  await page.waitForTimeout(300)
  await expect(input).toBeFocused()
  await input.fill('Third idea')
  await input.press('Enter')
  await expect(mapNode(page, 'Third idea').locator('[aria-current="true"]')).toHaveCount(1)
  await expect(page.getByTestId('search-count')).toHaveText('1 of 2')
})

test('#201: plain Shift+Tab moves focus out of the map', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Only child')
  await expect(page.getByTestId('map-canvas')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByTestId('map-canvas')).not.toBeFocused()
  await expect(canvasRenameInput(page)).toHaveCount(0)
  await expect(mapNode(page, 'New idea')).toHaveCount(0)
})

test('#202: right-clicking a link over a card opens the card’s menu', async ({ page }) => {
  await newProject(page)
  // Three branches on each side; a link from the top right one to the bottom
  // left one crosses the central topic.
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']
  await addChild(page, names[0])
  for (const name of names.slice(1)) await addSibling(page, name)

  await mapNode(page, 'Alpha').click()
  await page.getByTestId('node-details').getByRole('button', { name: 'Link to…' }).click()
  const picker = page.getByRole('dialog', { name: 'Link “Alpha” to…' })
  await picker.getByRole('combobox').fill('foxt')
  await page.keyboard.press('Enter')
  await expect(picker).toHaveCount(0)
  const link = page.locator('.react-flow__edge-linkEdge')
  await expect(link).toHaveCount(1)

  // A point on the link that lies over a card other than its ends.
  const over = await link.locator('.react-flow__edge-interaction').evaluate((element) => {
    const path = element as unknown as {
      getTotalLength(): number
      getPointAtLength(length: number): { x: number; y: number }
      getScreenCTM(): { a: number; b: number; c: number; d: number; e: number; f: number }
    }
    const m = path.getScreenCTM()
    const total = path.getTotalLength()
    const doc = (
      globalThis as unknown as {
        document: {
          elementsFromPoint(
            x: number,
            y: number,
          ): { closest(s: string): { getAttribute(n: string): string | null } | null }[]
        }
      }
    ).document
    for (let i = 1; i < 200; i++) {
      const p = path.getPointAtLength((total * i) / 200)
      const x = p.x * m.a + p.y * m.c + m.e
      const y = p.x * m.b + p.y * m.d + m.f
      const hits = doc.elementsFromPoint(x, y)
      if (!hits.some((hit) => hit.closest('.react-flow__edge-linkEdge'))) continue
      const card = hits.map((hit) => hit.closest('.react-flow__node')).find(Boolean)
      if (card) return { x, y, id: card.getAttribute('data-id') }
    }
    return null
  })
  expect(over).not.toBeNull()
  await mapNode(page, 'Bravo').click()
  await page.mouse.click(over!.x, over!.y, { button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.locator(`.react-flow__node[data-id="${over!.id}"]`)).toHaveClass(/selected/)
})
