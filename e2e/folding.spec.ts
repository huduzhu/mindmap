import { expect, test, type Page } from '@playwright/test'
import { addChild, mapNode, newProject, projectMenu } from './helpers.ts'

function row(page: Page, view: 'outline-view' | 'brainstorm-outliner', title: string) {
  return page
    .getByTestId(view)
    .locator('.outliner-row')
    .filter({ has: page.locator('.outliner-title', { hasText: new RegExp(`^${title}$`) }) })
}

test('#145: collapse all on the map folds the Outline the same way; Alt+2 shows two levels', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Launch')
  await addChild(page, 'Pricing')
  await addChild(page, 'Tiers')

  await page.keyboard.press('Alt+Comma')
  await expect(mapNode(page, 'Launch')).toBeVisible()
  await expect(mapNode(page, 'Pricing')).toHaveCount(0)
  // The selection was inside the folded branch, so it moved to the branch.
  await expect(mapNode(page, 'Launch')).toHaveClass(/selected/)

  await page.getByRole('tab', { name: 'Outline' }).click()
  await expect(row(page, 'outline-view', 'Launch')).toHaveAttribute('aria-expanded', 'false')
  await expect(row(page, 'outline-view', 'Launch')).toContainText('+2')
  await expect(row(page, 'outline-view', 'Pricing')).toHaveCount(0)

  await page.keyboard.press('Alt+2')
  await expect(row(page, 'outline-view', 'Pricing')).toBeVisible()
  await expect(row(page, 'outline-view', 'Tiers')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Mind Map' }).click()
  await expect(mapNode(page, 'Pricing')).toBeVisible()
  await expect(mapNode(page, 'Tiers')).toHaveCount(0)
  await page.keyboard.press('Alt+Period')
  await expect(mapNode(page, 'Tiers')).toBeVisible()
})

test('#145: an idea folded with Space in Brainstorm stays folded after a reload', async ({
  page,
}) => {
  await newProject(page)
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  await expect(page.getByRole('tree', { name: 'Brainstorm ideas' })).toBeFocused()
  await page.keyboard.press('Enter')
  const input = page.locator('input.outliner-input')
  await input.fill('One')
  await input.press('Enter')
  await input.fill('Two')
  await input.press('Tab')
  await page.keyboard.press('Escape')
  await expect(row(page, 'brainstorm-outliner', 'Two')).toBeVisible()

  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await expect(row(page, 'brainstorm-outliner', 'Two')).toHaveCount(0)
  await expect(row(page, 'brainstorm-outliner', 'One')).toContainText('+1')

  await projectMenu(page, 'Save')
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  await expect(row(page, 'brainstorm-outliner', 'One')).toHaveAttribute('aria-expanded', 'false')
  await expect(row(page, 'brainstorm-outliner', 'Two')).toHaveCount(0)

  await page
    .getByTestId('brainstorm-outliner')
    .getByTestId(/^row-fold-/)
    .click()
  await expect(row(page, 'brainstorm-outliner', 'Two')).toBeVisible()
})
