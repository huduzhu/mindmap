import { expect, test } from '@playwright/test'
import { addChild, mapNode, newProject, projectMenu, renameProject } from './helpers.ts'

test('#75: a reload reopens the open project; Home returns to the start screen', async ({
  page,
}) => {
  await newProject(page)
  await renameProject(page, 'Survives reload')
  await addChild(page, 'Still here')
  await projectMenu(page, 'Save')
  // Wait for the write to land; a reload mid-write would drop it.
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()

  await page.reload()
  await expect(mapNode(page, 'Still here')).toBeVisible()
  await expect(page.locator('button.toolbar-project-name-button')).toHaveText('Survives reload')

  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
})
