import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { addChild, mapNode, newProject } from './helpers.ts'

test('#146: focus on a branch, add inside it, go back by the breadcrumb, export just the branch', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Launch')
  await addChild(page, 'Pricing')
  await mapNode(page, 'Untitled project').click()
  await addChild(page, 'Hiring')

  await mapNode(page, 'Launch').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Focus on this branch' }).click()
  const crumbs = page.getByRole('navigation', { name: 'Focused branch' })
  await expect(crumbs).toBeVisible()
  await expect(crumbs.getByRole('button', { name: 'Untitled project' })).toBeVisible()
  await expect(crumbs.locator('[aria-current="location"]')).toHaveText('Launch')
  await expect(mapNode(page, 'Pricing')).toBeVisible()
  await expect(mapNode(page, 'Hiring')).toHaveCount(0)

  // The focused node is selected, so Tab adds inside the branch.
  await addChild(page, 'Budget')
  await expect(mapNode(page, 'Hiring')).toHaveCount(0)

  await crumbs.getByRole('button', { name: 'Untitled project' }).click()
  await expect(crumbs).toHaveCount(0)
  await expect(mapNode(page, 'Hiring')).toBeVisible()
  await expect(mapNode(page, 'Budget')).toBeVisible()

  await mapNode(page, 'Launch').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Export this branch…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export the branch “Launch”' })
  await expect(dialog).toBeVisible()
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Markdown outline' }).click()
  const markdown = await readFile((await (await downloading).path())!, 'utf8')
  expect(markdown).toContain('# Launch')
  expect(markdown).toContain('- Pricing')
  expect(markdown).toContain('- Budget')
  expect(markdown).not.toContain('Hiring')
  expect(markdown).not.toContain('Untitled project')
  await expect(dialog).toHaveCount(0)
})

test('#146: Alt+→ focuses the selection, Esc goes back up', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Launch')
  await addChild(page, 'Pricing')
  await mapNode(page, 'Untitled project').click()
  await addChild(page, 'Hiring')

  await mapNode(page, 'Launch').click()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(page.getByRole('navigation', { name: 'Focused branch' })).toBeVisible()
  await expect(mapNode(page, 'Hiring')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: 'Focused branch' })).toHaveCount(0)
  await expect(mapNode(page, 'Hiring')).toBeVisible()
  // Back at the whole map, Launch is still selected.
  await expect(mapNode(page, 'Launch')).toHaveClass(/selected/)
})

test('#146: a branch exports as a PNG image, and the map is whole again afterwards', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Launch')
  await addChild(page, 'Pricing')
  await mapNode(page, 'Untitled project').click()
  await addChild(page, 'Hiring')

  await mapNode(page, 'Launch').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Export this branch…' }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PNG image' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/launch\.png$/)
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(1, 4).toString()).toBe('PNG')
  await expect(page.getByRole('navigation', { name: 'Focused branch' })).toHaveCount(0)
  await expect(mapNode(page, 'Hiring')).toBeVisible()
})
