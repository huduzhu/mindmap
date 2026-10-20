import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { addChild, mapNode, newProject, renameProject, toast } from './helpers.ts'

async function addBullets(page: Page, titles: string[]) {
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  await page.getByTestId('brainstorm-add').click()
  const input = page.locator('input.outliner-input')
  // Enter commits a bullet and opens the next one, so titles chain.
  for (const title of titles) {
    await expect(input).toBeFocused()
    await input.fill(title)
    await input.press('Enter')
    await expect(page.locator('.outliner-title', { hasText: title })).toBeVisible()
  }
  // Escape discards the empty bullet the last Enter opened.
  await input.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(page.locator('.outliner-title', { hasText: 'New idea' })).toHaveCount(0)
  for (const title of titles) {
    await expect(page.locator('.outliner-title', { hasText: title })).toBeVisible()
  }
}

test('#87: three brainstorm bullets become three map branches offline', async ({ page }) => {
  await newProject(page)
  await addBullets(page, ['Research', 'Design', 'Launch'])
  await page.getByTestId('brainstorm-to-map').click()
  const dialog = page.getByRole('dialog', { name: 'Copy brainstorm to map' })
  await expect(dialog.getByTestId('choice-append')).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('tab', { name: 'Mind Map' })).toHaveAttribute('aria-selected', 'true')
  for (const title of ['Research', 'Design', 'Launch']) {
    await expect(mapNode(page, title)).toBeVisible()
  }
  await expect(toast(page)).toContainText('Copied 3 ideas')
})

test('#90: link two nodes from the details panel and remove the link', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Alpha')
  await page.keyboard.press('Enter')
  const input = page.locator('input.map-node-input')
  await input.fill('Beta')
  await input.press('Enter')
  await expect(mapNode(page, 'Beta')).toBeVisible()

  await mapNode(page, 'Alpha').click()
  await page.getByTestId('node-details').getByRole('button', { name: 'Link to…' }).click()
  const picker = page.getByRole('dialog', { name: 'Link “Alpha” to…' })
  await picker.getByRole('combobox').fill('bet')
  await page.keyboard.press('Enter')
  await expect(picker).toHaveCount(0)
  await expect(page.locator('.react-flow__edge-linkEdge')).toHaveCount(1)
  await expect(page.getByTestId('node-links')).toContainText('Beta')

  await page.getByRole('button', { name: 'Remove link to Beta' }).click()
  await expect(page.locator('.react-flow__edge-linkEdge')).toHaveCount(0)
})

test('#84: an expand file merges into its source project by default', async ({ page }, info) => {
  await newProject(page)
  await renameProject(page, 'Launch')
  await addBullets(page, ['Existing idea'])

  // The packet carries this project's library id, as the real round trip does.
  await page.getByRole('button', { name: 'Export ▾' }).click()
  await page.getByRole('menuitem', { name: 'For AI…' }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download packet' }).click()
  const packet = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  expect(packet.projectId).toBeTruthy()

  // What the LLM would send back: the same tree plus one bullet.
  const brainstorm = packet.payload.brainstorm
  brainstorm.children = [...(brainstorm.children ?? []), { id: 'llm-1', title: 'Idea from AI' }]
  const update = {
    kind: 'brainstorm-update',
    schemaVersion: 1,
    sourceProjectId: packet.projectId,
    name: 'Launch',
    preset: packet.preset,
    brainstorm,
  }
  const file = info.outputPath('update.json')
  await import('node:fs/promises').then((fs) => fs.writeFile(file, JSON.stringify(update)))

  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await (await choosing).setFiles(file)
  const dialog = page.getByRole('dialog', { name: 'Import an expanded brainstorm' })
  await expect(dialog).toContainText('1 new bullet added')
  await expect(dialog.getByTestId('choice-merge')).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(toast(page)).toContainText('Merged into “Launch”')
  await expect(page.locator('.outliner-title', { hasText: 'Idea from AI' })).toBeVisible()
  await expect(page.locator('button.toolbar-project-name-button')).toHaveText('Launch')
  // Still one project: no "(expanded)" copy.
  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page.locator('.project-list > li')).toHaveCount(1)
})

test('AI convert: the returned map lands in the source project, not a new one', async ({
  page,
}, info) => {
  await newProject(page)
  await renameProject(page, 'Launch')
  await addBullets(page, ['Pricing', 'Channels'])

  await page.getByRole('button', { name: 'Export ▾' }).click()
  await page.getByRole('menuitem', { name: 'For AI…' }).click()
  await page.getByRole('radio', { name: /Convert to a map/ }).check()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download packet' }).click()
  const packet = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  expect(packet.intent).toBe('convert')
  expect(packet.returnContract).toContain(`"sourceProjectId" to "${packet.projectId}"`)

  // What the AI would send back for "convert": a template carrying the id.
  const reply = {
    kind: 'template',
    schemaVersion: 1,
    sourceProjectId: packet.projectId,
    name: 'Launch',
    preset: packet.preset,
    root: {
      id: 'ai-root',
      title: 'Launch',
      role: 'theme',
      children: [
        { id: 'ai-1', title: 'Go to market', role: 'main-branch', side: 'right' },
        { id: 'ai-2', title: 'Money', role: 'main-branch', side: 'left' },
      ],
    },
  }
  const file = info.outputPath('convert.json')
  await import('node:fs/promises').then((fs) => fs.writeFile(file, JSON.stringify(reply)))

  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await (await choosing).setFiles(file)
  const dialog = page.getByRole('dialog', { name: 'Import an AI mind map' })
  await expect(dialog).toContainText('2 nodes in the new map')
  await expect(dialog.getByTestId('choice-apply')).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(toast(page)).toContainText('Put the AI’s mind map into “Launch”')
  await expect(page.getByRole('tab', { name: 'Mind Map' })).toHaveAttribute('aria-selected', 'true')
  await expect(mapNode(page, 'Go to market')).toBeVisible()
  await expect(mapNode(page, 'Money')).toBeVisible()
  // The brainstorm is still there.
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  await expect(page.locator('.outliner-title', { hasText: 'Pricing' })).toBeVisible()
  // And there is still one project.
  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page.locator('.project-list > li')).toHaveCount(1)
})
