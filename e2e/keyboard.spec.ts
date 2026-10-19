import { expect, test, type Page } from '@playwright/test'
import { addChild, mapNode, newProject } from './helpers.ts'

/** Add a sibling after the selected node with Enter and name it. */
async function addSibling(page: Page, title: string): Promise<void> {
  await page.keyboard.press('Enter')
  const input = page.locator('input.map-node-input')
  await expect(input).toBeFocused()
  await input.fill(title)
  await input.press('Enter')
  await expect(mapNode(page, title)).toBeVisible()
}

async function left(page: Page, title: string): Promise<number> {
  const box = await mapNode(page, title).boundingBox()
  if (!box) throw new Error(`${title} is not on screen`)
  return box.x
}

test('#131: Ctrl+] indents and Ctrl+[ outdents on the map', async ({ page }) => {
  await newProject(page)
  // Three branches: Alpha and Beta on the right, Gamma on the left.
  await addChild(page, 'Alpha')
  await addSibling(page, 'Beta')
  await addSibling(page, 'Gamma')
  await mapNode(page, 'Beta').click()
  await expect(mapNode(page, 'Beta')).toHaveClass(/selected/)
  // Measured against Alpha: the view may pan to keep the moved node in sight.
  const offset = async () => (await left(page, 'Beta')) - (await left(page, 'Alpha'))
  expect(Math.abs(await offset())).toBeLessThan(2)

  await page.keyboard.press('Control+BracketRight')
  await expect.poll(offset).toBeGreaterThan(40)
  await expect(mapNode(page, 'Beta')).toHaveClass(/selected/)

  await page.keyboard.press('Control+BracketLeft')
  await expect.poll(async () => Math.abs(await offset())).toBeLessThan(2)
})

function brainstormRow(page: Page, title: string) {
  return page
    .getByTestId('brainstorm-outliner')
    .locator('.outliner-row')
    .filter({ has: page.locator('.outliner-title', { hasText: new RegExp(`^${title}$`) }) })
}

async function indentOf(page: Page, title: string): Promise<number> {
  return brainstormRow(page, title).evaluate((row) => parseFloat(row.style.paddingLeft))
}

test('#132: Tab and Shift+Tab while typing a bullet nest it and keep typing', async ({ page }) => {
  await newProject(page)
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  // The Brainstorm view loads on first use (#141); type once it has focus.
  await expect(page.getByRole('tree', { name: 'Brainstorm ideas' })).toBeFocused()
  await expect(page.getByTestId('brainstorm-outliner')).toBeVisible()
  await page.keyboard.press('Enter')
  const input = page.locator('input.outliner-input')
  await expect(input).toBeFocused()
  await input.fill('One')
  await input.press('Enter')
  await expect(input).toBeFocused()
  await input.fill('Two')

  await page.keyboard.press('Tab')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Two')
  await page.keyboard.type(' nested')
  await page.keyboard.press('Shift+Tab')
  await expect(input).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')

  await expect(brainstormRow(page, 'Two nested')).toBeVisible()
  expect(await indentOf(page, 'Two nested')).toBeGreaterThan(await indentOf(page, 'One'))
})

test('#132: Shift+Tab keeps typing when the bullet moves past its siblings', async ({ page }) => {
  await newProject(page)
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  // The Brainstorm view loads on first use (#141); type once it has focus.
  await expect(page.getByRole('tree', { name: 'Brainstorm ideas' })).toBeFocused()
  await page.keyboard.press('Enter')
  const input = page.locator('input.outliner-input')
  await input.fill('One')
  await input.press('Enter')
  await input.fill('Two')
  await input.press('Tab')
  await input.press('Enter')
  await input.fill('Three')
  await input.press('Enter')
  await page.keyboard.press('Escape')
  await expect(brainstormRow(page, 'Three')).toBeVisible()

  // Two is One's first child, Three its second; lifting Two out moves it below Three.
  await brainstormRow(page, 'Two').click()
  await expect(input).toBeFocused()
  await input.press('Shift+Tab')
  await expect(input).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.type(' out')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  const titles = await page
    .getByTestId('brainstorm-outliner')
    .locator('.outliner-title')
    .allTextContents()
  expect(titles.slice(1)).toEqual(['One', 'Three', 'Two out'])
  expect(await indentOf(page, 'Two out')).toBe(await indentOf(page, 'One'))
})

test('#133: arrow keys follow the sides of the map', async ({ page }) => {
  await newProject(page)
  // Alpha and Beta go to the right, Gamma to the left.
  await addChild(page, 'Alpha')
  await addSibling(page, 'Beta')
  await addSibling(page, 'Gamma')
  await mapNode(page, 'Untitled project').click()
  const selected = (title: string) => expect(mapNode(page, title)).toHaveClass(/selected/)

  await page.keyboard.press('ArrowLeft')
  await selected('Gamma')
  await page.keyboard.press('ArrowRight')
  await selected('Untitled project')
  await page.keyboard.press('ArrowRight')
  await selected('Alpha')
  await page.keyboard.press('ArrowDown')
  await selected('Beta')
  // The last branch on the right: ↓ stays on this side instead of jumping to Gamma.
  await page.keyboard.press('ArrowDown')
  await selected('Beta')
  await page.keyboard.press('ArrowUp')
  await selected('Alpha')
})
