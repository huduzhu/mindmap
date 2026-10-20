import { expect, test } from '@playwright/test'
import { addChild, canvasRenameInput, mapNode, newProject } from './helpers.ts'

async function addSibling(page: import('@playwright/test').Page, title: string) {
  await page.keyboard.press('Enter')
  const input = canvasRenameInput(page)
  await expect(input).toBeFocused()
  await input.fill(title)
  await input.press('Enter')
  await expect(mapNode(page, title)).toBeVisible()
}

test('#101: copy a branch with Ctrl+C and paste it under another node', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await newProject(page)
  await addChild(page, 'Alpha')
  await addChild(page, 'Alpha one')
  await mapNode(page, 'Alpha').click()
  await addSibling(page, 'Beta')

  await mapNode(page, 'Alpha').click()
  await page.keyboard.press('ControlOrMeta+c')
  await mapNode(page, 'Beta').click()
  await page.keyboard.press('ControlOrMeta+v')
  // The pasted branch is selected (and panned to).
  await expect(page.getByTestId('node-details-title')).toHaveText('Alpha')
  // The map only draws nodes in view, so count in the Outline.
  const outlineRows = (title: string) =>
    page.locator('.outliner-title', { hasText: new RegExp(`^${title}$`) })
  await page.getByRole('tab', { name: 'Outline' }).click()
  await expect(outlineRows('Alpha')).toHaveCount(2)
  await expect(outlineRows('Alpha one')).toHaveCount(2)

  // One step to undo.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(outlineRows('Alpha')).toHaveCount(1)
  await page.getByRole('tab', { name: 'Mind Map' }).click()

  // Cut moves it.
  await mapNode(page, 'Beta').click()
  await page.keyboard.press('ControlOrMeta+x')
  await expect(mapNode(page, 'Beta')).toHaveCount(0)
  await mapNode(page, 'Alpha one').click()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(mapNode(page, 'Beta')).toBeVisible()
})

test('#101: the node menu copies and pastes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await newProject(page)
  await addChild(page, 'Idea')
  await mapNode(page, 'Idea').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy' }).click()
  const text = await page.evaluate(() =>
    (
      globalThis as unknown as { navigator: { clipboard: { readText(): Promise<string> } } }
    ).navigator.clipboard.readText(),
  )
  expect(text.replace(/\r\n/g, '\n')).toBe('- Idea\n')

  await mapNode(page, 'Idea').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Paste as sibling' }).click()
  await expect(mapNode(page, 'Idea')).toHaveCount(2)
})

test('#105: Shift+drag selects a box of nodes; Delete removes them in one step', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'One')
  await addSibling(page, 'Two')
  await addSibling(page, 'Three')

  const one = (await mapNode(page, 'One').boundingBox())!
  const two = (await mapNode(page, 'Two').boundingBox())!
  // A box from just above-left of One to the middle of Two, drawn on empty canvas.
  const start = { x: one.x - 12, y: one.y - 12 }
  await page.mouse.move(start.x, start.y)
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(two.x + two.width / 2, two.y + two.height / 2, { steps: 5 })
  await expect(page.getByTestId('select-box')).toBeVisible()
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('select-box')).toHaveCount(0)

  await expect(mapNode(page, 'One').locator('.map-node')).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('Delete')
  await expect(mapNode(page, 'One')).toHaveCount(0)
  await expect(mapNode(page, 'Two')).toHaveCount(0)
  await expect(mapNode(page, 'Three')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(mapNode(page, 'One')).toBeVisible()
  await expect(mapNode(page, 'Two')).toBeVisible()
})
