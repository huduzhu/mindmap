import { expect, test } from '@playwright/test'
import { mapNode, projectMenu, renameProject, toast } from './helpers.ts'

test('#78: "Try the guide" opens the bilingual guide in the map', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('start-empty')).toBeVisible()
  await page.getByRole('button', { name: 'Try the guide · 入门指南' }).click()

  await expect(mapNode(page, 'Getting started · 入门指南')).toBeVisible()
  await expect(mapNode(page, 'Build the map · 编辑导图')).toBeVisible()
  await expect(mapNode(page, 'Tab — add a child · 添加子节点')).toBeVisible()
  // The root opens selected (#71), so its welcome notes are on screen.
  await expect(page.getByTestId('node-details-notes-preview')).toContainText('欢迎')
  // The folded example stays folded until the reader opens it.
  await expect(mapNode(page, 'You unfolded me! · 你展开了我！')).toHaveCount(0)
})

test('#78: the ⋯ menu duplicates, exports and trashes a project from the start screen', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await renameProject(page, 'Row actions')
  await page.getByRole('button', { name: 'Home', exact: true }).click()

  const openMenu = async (name: string) => {
    await page.getByRole('button', { name: `More actions for ${name}`, exact: true }).click()
    await expect(page.getByRole('menu', { name: `Actions for ${name}` })).toBeVisible()
  }

  await openMenu('Row actions')
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByRole('button', { name: 'Row actions (copy)', exact: true })).toBeVisible()

  await openMenu('Row actions')
  const downloading = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export JSON' }).click()
  expect((await downloading).suggestedFilename()).toBe('row-actions.mindmap.json')

  await openMenu('Row actions (copy)')
  // Keyboard: End jumps to the last item.
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: 'Move to trash' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByTestId('confirm-dialog-accept').click()
  await expect(toast(page)).toHaveText('Moved "Row actions (copy)" to the trash')
  await expect(page.getByRole('button', { name: 'Trash (1)' })).toBeVisible()
})

test('#77: Save As asks in a themed dialog and validates inline', async ({ page }) => {
  let nativeDialogs = 0
  page.on('dialog', (dialog) => {
    nativeDialogs += 1
    void dialog.dismiss()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await projectMenu(page, 'Save As…')

  const dialog = page.getByRole('dialog', { name: 'Save As' })
  const input = dialog.getByLabel('Name for the copy')
  await expect(input).toHaveValue('Untitled project (Copy)')
  await expect(input).toBeFocused()
  await input.fill('')
  await expect(dialog.getByRole('alert')).toHaveText('Enter a name.')
  await input.press('Enter')
  await expect(dialog).toBeVisible()

  await input.fill('Forked in a dialog')
  await input.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('button.toolbar-project-name-button')).toHaveText('Forked in a dialog')
  expect(nativeDialogs).toBe(0)
})
