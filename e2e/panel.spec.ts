import { devices, expect, test } from '@playwright/test'
import { addChild, canvasRenameInput, mapNode, newProject } from './helpers.ts'

// The details panel you can hide (#144).

test('hiding the details panel keeps the selection and survives a reload', async ({ page }) => {
  await newProject(page)
  const panel = page.getByTestId('node-details')
  const toggle = page.getByRole('button', { name: 'Details', exact: true })
  await expect(panel).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  // × hides it without deselecting: Tab still adds a child to the root.
  await panel.getByRole('button', { name: 'Close details' }).click()
  await expect(panel).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await addChild(page, 'Still works')
  await expect(panel).toHaveCount(0)

  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  await page.reload()
  await expect(mapNode(page, 'Still works')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(panel).toHaveCount(0)

  // Ctrl/Cmd+I and the toolbar button bring it back.
  await mapNode(page, 'Still works').click()
  await page.keyboard.press('ControlOrMeta+i')
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('node-details-title')).toHaveText('Still works')
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await expect(panel).toBeVisible()
})

test('the panel stays in place while a node is renamed, so the map does not jump', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Idea')
  await mapNode(page, 'Idea').click()
  const panel = page.getByTestId('node-details')
  await expect(panel).toBeVisible()
  const canvas = page.getByTestId('map-canvas')
  const before = await canvas.boundingBox()

  await page.keyboard.press('F2')
  await expect(canvasRenameInput(page)).toBeFocused()
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('inert', '')
  expect(await canvas.boundingBox()).toEqual(before)

  await canvasRenameInput(page).fill('Renamed')
  await canvasRenameInput(page).press('Enter')
  await expect(panel).not.toHaveAttribute('inert', '')
  await expect(page.getByTestId('node-details-title')).toHaveText('Renamed')
})

test('the palette shows and hides the details panel', async ({ page }) => {
  await newProject(page)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('dialog').getByRole('combobox').fill('hide details')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('node-details')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('dialog').getByRole('combobox').fill('show details')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('node-details')).toBeVisible()
})

test.describe('on a phone', () => {
  const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7']
  test.use(pixel)

  test('the panel starts hidden and the notes button opens it', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Start a new project' }).tap()
    const bar = page.getByRole('toolbar', { name: 'Node actions' })
    await expect(bar).toBeVisible()
    await expect(page.getByTestId('node-details')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await bar.getByRole('button', { name: 'Edit the notes of Untitled project' }).tap()
    await expect(page.getByTestId('node-details')).toBeVisible()
    await expect(page.getByTestId('node-details-notes')).toBeFocused()
  })
})
