import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { addChild, mapNode, newProject, toast } from './helpers.ts'

test('#102: an outline imported into an open project lands under the selected node', async ({
  page,
}, info) => {
  const file = info.outputPath('packing list.md')
  await writeFile(file, '- Socks\n- Hat\n  - Wool\n')
  await newProject(page)
  await addChild(page, 'Trip')
  await mapNode(page, 'Trip').click()

  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await (await choosing).setFiles(file)
  const dialog = page.getByRole('dialog', { name: 'Import' })
  await expect(dialog).toContainText('4 nodes')
  // Opening it as a new project stays the default.
  await expect(dialog.getByTestId('choice-new')).toBeFocused()
  await dialog.getByTestId('choice-branch').click()

  await expect(toast(page)).toContainText('Added “packing list” (4 nodes)')
  await expect(mapNode(page, 'packing list')).toBeVisible()
  // Still one project, and one step to undo.
  await expect(page.locator('button.toolbar-project-name-button')).toHaveText('Untitled project')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(mapNode(page, 'packing list')).toHaveCount(0)
})

test('#103: the start screen finds projects by name and by the ideas inside', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Tomatoes')
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await page.getByRole('button', { name: 'Home' }).click()

  const search = page.getByRole('searchbox', { name: 'Search projects' })
  await expect(search).toBeVisible()
  await page.keyboard.press('/')
  await expect(search).toBeFocused()
  await search.fill('tomato')
  const rows = page.locator('.project-list li')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('contains “Tomatoes”')

  await search.fill('zebra')
  await expect(page.getByTestId('project-search-empty')).toBeVisible()
  await search.press('Escape')
  await expect(rows).toHaveCount(2)
})
