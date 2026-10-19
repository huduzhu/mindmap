import { expect, test } from '@playwright/test'
import { addChild, canvasRenameInput, mapNode, newProject, redoAll, undoAll } from './helpers.ts'

test.describe('canvas editing', () => {
  test('#39: a node created with Tab stays on the canvas after it is named', async ({ page }) => {
    await newProject(page)
    await addChild(page, 'First idea')
    await addChild(page, 'Nested idea')
    // Before #39 the node was culled as soon as editing ended.
    await page.waitForTimeout(300)
    await expect(mapNode(page, 'First idea')).toBeVisible()
    await expect(mapNode(page, 'Nested idea')).toBeVisible()
  })

  test('#71: a brand-new project has its root selected, so Tab works at once', async ({ page }) => {
    await newProject(page)
    await expect(mapNode(page, 'Untitled project')).toHaveClass(/selected/)
    await addChild(page, 'Straight away')
  })

  test('#38: F2 renames a child node and the new title sticks', async ({ page }) => {
    await newProject(page)
    await addChild(page, 'Old title')
    await mapNode(page, 'Old title').click()
    await page.keyboard.press('F2')
    const input = canvasRenameInput(page)
    await expect(input).toBeFocused()
    await input.fill('New title')
    await input.press('Enter')
    await expect(mapNode(page, 'New title')).toBeVisible()
    await expect(mapNode(page, 'Old title')).toHaveCount(0)
  })

  test('B2: collapsing a branch adds no undo step', async ({ page }) => {
    await newProject(page)
    await addChild(page, 'Parent')
    await addChild(page, 'Child')
    const before = await undoAll(page)
    expect(before).toBeGreaterThan(0)
    expect(await redoAll(page)).toBe(before)
    await expect(mapNode(page, 'Child')).toBeVisible()

    await mapNode(page, 'Parent').click()
    await page.keyboard.press('Space')
    await expect(mapNode(page, 'Child')).toHaveCount(0)
    expect(await undoAll(page)).toBe(before)
  })

  test('#73: the selected node stays in view when the details panel opens', async ({ page }) => {
    await newProject(page)
    for (const title of ['Right one', 'Right two', 'Right three', 'Left one']) {
      await addChild(page, title)
      await mapNode(page, 'Untitled project').click()
    }
    // × hides the panel (#144); the toolbar's Details button opens it again.
    await page.getByRole('button', { name: 'Close details' }).click()
    const canvas = page.getByTestId('map-canvas')
    const viewportBefore = await page.locator('.react-flow__viewport').getAttribute('style')
    const details = page.getByRole('button', { name: 'Details', exact: true })

    for (const title of ['Right one', 'Right two', 'Right three', 'Left one']) {
      await mapNode(page, title).click()
      await expect(page.getByTestId('node-details')).toHaveCount(0)
      await details.click()
      await expect(page.getByTestId('node-details')).toBeVisible()
      await page.waitForTimeout(300) // the pan animates for 180 ms
      const box = (await mapNode(page, title).boundingBox())!
      const view = (await canvas.boundingBox())!
      expect(box.x, `${title} starts left of the canvas`).toBeGreaterThanOrEqual(view.x)
      expect(box.x + box.width, `${title} ends right of the canvas`).toBeLessThanOrEqual(
        view.x + view.width,
      )
      await details.click()
    }
    // Adding and selecting nodes never changes the zoom (setCenter used to jump to 2.5×).
    const scale = (style: string | null) => /scale\(([\d.]+)\)/.exec(style ?? '')?.[1]
    expect(scale(await page.locator('.react-flow__viewport').getAttribute('style'))).toBe(
      scale(viewportBefore),
    )
  })

  test('#74: Escape releases the keyboard so Tab can leave the canvas', async ({ page }) => {
    await newProject(page)
    await addChild(page, 'Idea')
    const nodes = await page.locator('.react-flow__node').count()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Tab')
    await expect(page.locator('.react-flow__node')).toHaveCount(nodes)
    // Focus moved on from the canvas (to its zoom controls) instead of adding a node.
    await expect(page.getByTestId('map-canvas')).not.toBeFocused()
  })
})
