import { expect, test } from '@playwright/test'
import { addChild, canvasRenameInput, mapNode, newProject } from './helpers.ts'

test('#92: a note typed without leaving the box survives a reload', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Idea')
  await mapNode(page, 'Idea').click()
  const notes = page.getByTestId('node-details-notes')
  await notes.click()
  await page.keyboard.type('still here after reload')
  // No blur, no click elsewhere: the note is committed after a short pause and
  // autosaved, then the page reloads.
  const status = page.getByTestId('save-status')
  await expect(status).toHaveText('Unsaved')
  await expect(status).toHaveText('Saved')
  await page.reload()

  await mapNode(page, 'Idea').click()
  await expect(page.getByTestId('node-details-notes')).toHaveValue('still here after reload')
})

test('#93: a link in the notes preview opens in a new tab', async ({ page, context }) => {
  await newProject(page)
  await addChild(page, 'Idea')
  await mapNode(page, 'Idea').click()
  await page.getByTestId('node-details-notes').fill('See [the spec](https://example.com/spec)')
  // Let the note commit first, as it does while the pointer travels to the link.
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved')
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  const link = page
    .getByTestId('node-details-notes-preview')
    .getByRole('link', { name: 'the spec' })
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')

  const appUrl = page.url()
  const popup = context.waitForEvent('page')
  await link.click()
  await popup
  expect(context.pages()).toHaveLength(2)
  expect(page.url()).toBe(appUrl)
  await expect(mapNode(page, 'Idea')).toBeVisible()
})

test('#96: switching views keeps the selection, so Tab still adds a child', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Alpha')
  await mapNode(page, 'Alpha').click()

  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  // The brainstorm root is selected, so its details are open.
  await expect(page.getByTestId('node-details')).toBeVisible()
  await page.getByRole('tab', { name: 'Mind Map' }).click()
  await expect(page.getByTestId('node-details-title')).toHaveText('Alpha')

  await page.keyboard.press('Tab')
  const input = canvasRenameInput(page)
  await expect(input).toBeFocused()
  await input.fill('Beta')
  await input.press('Enter')
  await expect(mapNode(page, 'Beta')).toBeVisible()

  // Beta was added under Alpha: the outline indents it one level deeper.
  await page.getByRole('tab', { name: 'Outline' }).click()
  const indent = (title: string) =>
    page
      .locator('.outliner-row', { has: page.locator('.outliner-title', { hasText: title }) })
      .evaluate((row) => parseFloat((row as { style: { paddingLeft: string } }).style.paddingLeft))
  expect(await indent('Beta')).toBeGreaterThan(await indent('Alpha'))
})
