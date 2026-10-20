import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addChild, exportVia, mapNode, newProject } from './helpers.ts'

// Node tags and filtering (#150): `#tag` at the end of a title while
// renaming, the details panel's tag field, the toolbar's tag filter, `#tag`
// search and Markdown export.

async function tagInPanel(page: Page, title: string, tag: string) {
  await mapNode(page, title).click()
  const field = page.getByTestId('node-details').getByTestId('tag-input')
  await field.fill(tag)
  await field.press('Enter')
  await expect(mapNode(page, title).locator('.node-tag')).toContainText([`#${tag}`])
}

async function addUnderRoot(page: Page, title: string) {
  await mapNode(page, 'Untitled project').click()
  await addChild(page, title)
}

test('tag three nodes, filter by one tag, hide the rest, clear; #tag search; Markdown', async ({
  page,
}) => {
  await newProject(page)
  // "#p1" at the end of a title becomes a tag when the rename is saved.
  await page.keyboard.press('Tab')
  const input = page.locator('input.map-node-input')
  await expect(input).toBeFocused()
  await input.fill('Fix login #p1')
  await input.press('Enter')
  await expect(mapNode(page, 'Fix login')).toBeVisible()
  await expect(mapNode(page, 'Fix login').locator('.node-tag')).toHaveText(['#p1'])

  await addUnderRoot(page, 'Pricing')
  await addUnderRoot(page, 'Hiring')
  await addUnderRoot(page, 'Marketing')
  await tagInPanel(page, 'Pricing', 'p1')
  await tagInPanel(page, 'Hiring', 'hr')

  // Filter by #p1: the matches stay, their root at 60%, the rest at 25%.
  await page.getByTestId('tags-toggle').click()
  const bar = page.getByTestId('tag-filter')
  await expect(bar.getByTestId('tag-filter-p1')).toContainText('2')
  await bar.getByTestId('tag-filter-p1').click()
  await expect(page.getByTestId('tag-filter-chip')).toHaveText(/#p1/)
  await expect(mapNode(page, 'Marketing')).toHaveClass(/tag-dim/)
  await expect(mapNode(page, 'Hiring')).toHaveClass(/tag-dim/)
  await expect(mapNode(page, 'Fix login')).not.toHaveClass(/tag-dim|tag-path/)
  await expect(mapNode(page, 'Pricing')).not.toHaveClass(/tag-dim|tag-path/)
  await expect(mapNode(page, 'Untitled project')).toHaveClass(/tag-path/)
  await expect(mapNode(page, 'Marketing')).toHaveCSS('opacity', '0.25')
  await expect(mapNode(page, 'Untitled project')).toHaveCSS('opacity', '0.6')
  await expect(mapNode(page, 'Pricing')).toHaveCSS('opacity', '1')

  // Hide mode: only the matches and their path to the root.
  await bar.getByTestId('tag-filter-hide').click()
  await expect(mapNode(page, 'Marketing')).toHaveCount(0)
  await expect(mapNode(page, 'Hiring')).toHaveCount(0)
  await expect(mapNode(page, 'Fix login')).toBeVisible()
  await expect(mapNode(page, 'Pricing')).toBeVisible()

  // × on the toolbar chip clears it: everything is back at full strength.
  await page.getByTestId('tag-filter-chip-clear').click()
  await expect(page.getByTestId('tag-filter-chip')).toHaveCount(0)
  await expect(mapNode(page, 'Marketing')).toBeVisible()
  await expect(page.locator('.react-flow__node.tag-dim')).toHaveCount(0)
  await page.getByTestId('tag-filter-close').click()
  await expect(bar).toHaveCount(0)

  // #tag search finds the tagged nodes, and #tag with text narrows them.
  const search = page.getByTestId('studio-search')
  await search.fill('#p1 ')
  await expect(page.getByTestId('search-count')).toHaveText('1 of 2')
  await search.fill('#p1 pricing')
  await expect(page.getByTestId('search-count')).toHaveText('1 of 1')
  await search.press('Escape')

  // A branch exports its tags as trailing " #tag" in Markdown.
  await mapNode(page, 'Pricing').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Export this branch…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export the branch “Pricing”' })
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Markdown outline' }).click()
  const branch = await readFile((await (await downloading).path())!, 'utf8')
  expect(branch).toContain('# Pricing #p1')

  // Renaming in Brainstorm works the same; the Markdown export keeps the tag.
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  await page.getByTestId('brainstorm-add').click()
  const row = page.locator('input.outliner-input')
  await expect(row).toBeFocused()
  await row.fill('Measure the walls #site')
  // Enter saves it and starts the next idea; Esc drops that empty one.
  await row.press('Enter')
  await page.locator('input.outliner-input').press('Escape')
  const saved = page.locator('.outliner-row', { hasText: 'Measure the walls' })
  await expect(saved.locator('.outliner-title')).toHaveText('Measure the walls')
  await expect(saved.locator('.node-tag')).toHaveText(['#site'])
  const download = await exportVia(page, /Markdown outline/)
  const markdown = await readFile((await download.path())!, 'utf8')
  expect(markdown).toContain('- Measure the walls #site')
})
