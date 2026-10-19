import { expect, test, type Page } from '@playwright/test'
import { addChild, mapNode, newProject } from './helpers.ts'

/** The centre of a node on screen. */
async function centre(page: Page, title: string) {
  const box = await mapNode(page, title).boundingBox()
  if (!box) throw new Error(`${title} is not on screen`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test('live test item 2: a dragged node follows the pointer, shows where it lands and can flip sides', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Alpha')
  await mapNode(page, 'Untitled project').click()
  await addChild(page, 'Beta')
  // Start with the root selected: dragging a node that is not selected works too.
  await mapNode(page, 'Untitled project').click()

  const root = await centre(page, 'Untitled project')
  const alpha = await centre(page, 'Alpha')
  const otherSide = alpha.x > root.x ? -1 : 1

  await page.mouse.move(alpha.x, alpha.y)
  await page.mouse.down()
  // Across the central topic and well past it, into open space on the other side.
  const target = { x: root.x + otherSide * 320, y: root.y + 160 }
  await page.mouse.move(target.x, target.y, { steps: 25 })

  // The card follows the pointer…
  const moved = await centre(page, 'Alpha')
  expect(Math.abs(moved.x - target.x)).toBeLessThan(80)
  // …the central topic is outlined as the new parent, and the line says which side.
  await expect(mapNode(page, 'Untitled project')).toHaveClass(/map-drop-target/)
  await expect(page.getByTestId('map-drop-line')).toContainText(
    otherSide < 0 ? 'Left side' : 'Right side',
  )

  await page.mouse.up()
  await expect(page.getByTestId('map-drop-line')).toHaveCount(0)
  await expect(page.getByTestId('node-details-title')).toHaveText('Alpha')
  await expect(async () => {
    const after = await centre(page, 'Alpha')
    const rootNow = await centre(page, 'Untitled project')
    expect(Math.sign(after.x - rootNow.x)).toBe(otherSide)
  }).toPass()
})

test('live test item 2: dropping onto a node makes it the parent; open space on its own side changes nothing', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Alpha')
  await mapNode(page, 'Untitled project').click()
  await addChild(page, 'Beta')

  // Open space beyond its own lane, on its own side: no preview, and no change.
  const alpha = await centre(page, 'Alpha')
  const root = await centre(page, 'Untitled project')
  const away = alpha.x > root.x ? 1 : -1
  await page.mouse.move(alpha.x, alpha.y)
  await page.mouse.down()
  await page.mouse.move(alpha.x + away * 600, alpha.y + 300, { steps: 15 })
  await expect(page.getByTestId('map-drop-line')).toHaveCount(0)
  await page.mouse.up()
  // Dragging near the edge pans the view, so compare with the central topic.
  await expect(async () => {
    const back = await centre(page, 'Alpha')
    const rootNow = await centre(page, 'Untitled project')
    expect(Math.abs(back.x - rootNow.x - (alpha.x - root.x))).toBeLessThan(2)
    expect(Math.abs(back.y - rootNow.y - (alpha.y - root.y))).toBeLessThan(2)
  }).toPass()

  // Onto Beta: Beta is outlined, and Alpha becomes its child, further out.
  const from = await centre(page, 'Alpha')
  const beta = await centre(page, 'Beta')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(beta.x, beta.y, { steps: 15 })
  await expect(mapNode(page, 'Beta')).toHaveClass(/map-drop-target/)
  await page.mouse.up()
  await expect(async () => {
    const child = await centre(page, 'Alpha')
    const parent = await centre(page, 'Beta')
    const rootNow = await centre(page, 'Untitled project')
    const out = Math.sign(parent.x - rootNow.x)
    expect(Math.sign(child.x - parent.x)).toBe(out)
  }).toPass()
})

test('review #164: Esc during a drag clears the preview and the card goes back', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Alpha')
  await mapNode(page, 'Untitled project').click()
  await addChild(page, 'Beta')
  const alpha = await centre(page, 'Alpha')
  const beta = await centre(page, 'Beta')
  await page.mouse.move(alpha.x, alpha.y)
  await page.mouse.down()
  await page.mouse.move(beta.x, beta.y, { steps: 15 })
  await expect(mapNode(page, 'Beta')).toHaveClass(/map-drop-target/)
  await page.keyboard.press('Escape')
  await page.mouse.move(beta.x + 5, beta.y + 5, { steps: 3 })
  await expect(page.getByTestId('map-drop-line')).toHaveCount(0)
  await expect(mapNode(page, 'Beta')).not.toHaveClass(/map-drop-target/)
  await page.mouse.up()
})

test('review #162: with two nodes selected, the dragged one follows the pointer', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Alpha')
  await page.keyboard.press('Enter')
  await page.locator('input.map-node-input').fill('Beta')
  await page.locator('input.map-node-input').press('Enter')
  // Both orders: React Flow reports the selected nodes in layout order.
  for (const [primary, other] of [
    ['Alpha', 'Beta'],
    ['Beta', 'Alpha'],
  ]) {
    // The first node clicked is the primary selection; Shift adds the other.
    await mapNode(page, primary).click()
    await mapNode(page, other).click({ modifiers: ['Shift'] })
    const start = await centre(page, primary)
    const before = await centre(page, other)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    const target = { x: start.x + 40, y: start.y + 220 }
    await page.mouse.move(target.x, target.y, { steps: 15 })
    const moved = await centre(page, primary)
    const still = await centre(page, other)
    expect(Math.abs(moved.y - target.y)).toBeLessThan(40)
    expect(Math.abs(still.y - before.y)).toBeLessThan(2)
    // Let go where it started: nothing changes.
    await page.mouse.move(start.x, start.y, { steps: 5 })
    await page.mouse.up()
  }
})
