import { expect, test } from '@playwright/test'
import { addChild, newProject } from './helpers.ts'

test('#104: customize a preset, use it, and keep it after a reload', async ({ page }) => {
  await newProject(page)
  await page.getByRole('button', { name: 'Presets' }).click()
  const dialog = page.getByRole('dialog', { name: 'Presets' })
  await dialog.getByTestId('preset-edit-default').click()
  const editor = page.getByTestId('preset-editor')
  await expect(page.getByRole('heading', { name: 'Edit preset' })).toBeVisible()
  await editor.getByTestId('preset-editor-name').fill('night-sky')
  await editor.getByTestId('preset-colour-background').fill('#101828')
  await editor.getByTestId('preset-colour-text').fill('#f9fafb')
  await editor.getByTestId('preset-colour-nodeFill').fill('#1f2a44')
  await expect(editor.getByTestId('preset-preview')).toHaveCSS(
    'background-color',
    'rgb(16, 24, 40)',
  )
  await editor.getByTestId('preset-editor-save-use').click()
  await expect(page.getByTestId('preset-editor')).toHaveCount(0)

  const canvasBackground = () =>
    page
      .locator('.canvas-wrap')
      .evaluate(
        (el) =>
          (
            globalThis as unknown as { getComputedStyle(e: unknown): { backgroundColor: string } }
          ).getComputedStyle(el).backgroundColor,
      )
  await expect.poll(canvasBackground).toBe('rgb(16, 24, 40)')
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  await page.reload()
  await expect.poll(canvasBackground).toBe('rgb(16, 24, 40)')
})

test('#106: Print sends the whole map, or the outline, to a print page', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Printed idea')
  // The page prints from a hidden frame; catch it while it exists.
  const frame = page.locator('iframe.print-frame')

  await page.getByRole('button', { name: 'Export ▾' }).click()
  await page.getByRole('menuitem', { name: 'Print / save as PDF…' }).click()
  await expect(frame).toBeAttached()
  await expect(frame.contentFrame().locator('.map-page img')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  )

  await page.getByRole('tab', { name: 'Outline' }).click()
  await page.keyboard.press('ControlOrMeta+p')
  await expect(frame.last().contentFrame().locator('h1')).toHaveText('Untitled project')
  await expect(frame.last().contentFrame().locator('li .title')).toHaveText('Printed idea')
})
