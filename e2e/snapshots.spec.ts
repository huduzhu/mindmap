import { expect, test } from '@playwright/test'
import { addChild, mapNode, newProject, projectMenu, toast } from './helpers.ts'

test('#43: reusing a snapshot name keeps both restore points', async ({ page }) => {
  await newProject(page)
  const saveSnapshot = async (name: string) => {
    await projectMenu(page, 'Save snapshot…')
    // A themed dialog now, not window.prompt (#77).
    const input = page.getByRole('dialog', { name: 'Save snapshot' }).getByLabel('Snapshot name')
    await expect(input).toBeFocused()
    await input.fill(name)
    await input.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Save snapshot' })).toHaveCount(0)
  }
  await saveSnapshot('checkpoint')
  await expect(toast(page)).toHaveText('Saved snapshot “checkpoint”')
  await saveSnapshot('checkpoint')
  await expect(toast(page)).toContainText('saved as “checkpoint (2)”')
  await page.getByRole('button', { name: 'Project ▾' }).click()
  await expect(page.getByRole('menuitem', { name: 'Snapshots (2)…' })).toBeVisible()
})

test('#98: snapshots dialog shows dates, restores after confirming, and deletes after confirming', async ({
  page,
}) => {
  await newProject(page)
  await projectMenu(page, 'Save snapshot…')
  const input = page.getByRole('dialog', { name: 'Save snapshot' }).getByLabel('Snapshot name')
  await input.fill('Empty map')
  await input.press('Enter')
  await expect(toast(page)).toHaveText('Saved snapshot “Empty map”')
  await mapNode(page, 'Untitled project').click()
  await addChild(page, 'Added later')

  await projectMenu(page, 'Snapshots (1)…')
  const dialog = page.getByRole('dialog', { name: 'Snapshots' })
  const row = dialog.getByTestId('snapshot-row')
  await expect(row).toContainText('Empty map')
  await expect(row).toContainText('1 node')
  await expect(row).toContainText(String(new Date().getFullYear()))

  await dialog.getByRole('button', { name: 'Restore Empty map' }).click()
  const confirmRestore = page.getByRole('dialog', { name: 'Restore snapshot' })
  await confirmRestore.getByRole('button', { name: 'Restore' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(mapNode(page, 'Added later')).toHaveCount(0)
  // One undo step brings the edit back.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(mapNode(page, 'Added later')).toBeVisible()

  await projectMenu(page, 'Snapshots (1)…')
  await dialog.getByRole('button', { name: 'Delete Empty map' }).click()
  await page
    .getByRole('dialog', { name: 'Delete snapshot' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(dialog.getByTestId('snapshots-empty')).toBeVisible()
})
