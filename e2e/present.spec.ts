import { readFile, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { exportVia, mapNode } from './helpers.ts'

// Presentation mode (#152): F5 walks through the map one step at a time,
// full screen and read only.

function project() {
  return {
    kind: 'project',
    schemaVersion: 1,
    name: 'Show',
    preset: 'default',
    brainstorm: { id: 'b-root', title: 'Ideas' },
    map: {
      id: 'r',
      title: 'Show map',
      children: [
        {
          id: 'a',
          title: 'Launch',
          children: [{ id: 'p', title: 'Pricing', notes: 'Three tiers' }],
        },
        // Folded on the map: the presentation opens it for the show only.
        { id: 'b', title: 'Hiring', collapsed: true, children: [{ id: 'b1', title: 'Roles' }] },
      ],
    },
  }
}

async function openProject(page: Page, file: string) {
  await writeFile(file, JSON.stringify(project()))
  await page.goto('/')
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import or restore…' }).click()
  await (await choosing).setFiles(file)
  await expect(mapNode(page, 'Show map')).toBeInViewport()
}

const viewport = (page: Page) =>
  page.getByTestId('map-canvas').locator('.react-flow__viewport').getAttribute('style')

test('F5, three steps, Esc: the project, its history and the view are unchanged', async ({
  page,
}, info) => {
  await openProject(page, info.outputPath('show.json'))
  const undo = page.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeDisabled()
  const saved = await page.getByTestId('save-status').textContent()
  const before = await viewport(page)

  await page.getByTestId('map-canvas').focus()
  await page.keyboard.press('F5')
  const stage = page.getByRole('dialog', { name: 'Presenting Show map' })
  await expect(stage).toBeVisible()
  await expect(stage).toHaveAttribute('data-step', '1')
  await expect(page.getByTestId('present-counter')).toHaveText('1 / 5')
  // The toolbar is covered: the stage fills the window.
  const box = (await stage.boundingBox())!
  const size = page.viewportSize()!
  expect(Math.round(box.width)).toBe(size.width)
  expect(Math.round(box.height)).toBe(size.height)

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  await page.keyboard.press('PageDown')
  await expect(stage).toHaveAttribute('data-step', '4')
  await expect(stage.locator('.react-flow__node.present-current')).toHaveText('Pricing')
  await expect(page.getByTestId('present-counter')).toHaveText('4 / 5')
  await expect(page.getByTestId('announcer')).toContainText('Step 4 of 5: Pricing, under Launch')

  await page.keyboard.press('Escape')
  await expect(stage).toHaveCount(0)
  await expect(undo).toBeDisabled()
  await expect(page.getByTestId('save-status')).toHaveText(saved!)
  await expect(mapNode(page, 'Roles')).toHaveCount(0)
  expect(await viewport(page)).toBe(before)
  await expect(page.getByTestId('map-canvas')).toBeFocused()
})

test('presenting from a folded branch unfolds it only during the show', async ({ page }, info) => {
  await openProject(page, info.outputPath('folded.json'))
  await mapNode(page, 'Hiring').click()
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('dialog').getByRole('combobox').fill('Present from here')
  await page.keyboard.press('Enter')

  const stage = page.getByTestId('present-stage')
  await expect(stage).toHaveAttribute('data-current', 'b')
  await expect(stage.locator('.react-flow__node[data-id="b1"]')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(stage).toHaveAttribute('data-current', 'b1')
  await expect(stage.locator('.react-flow__node[data-id="b1"]')).toBeVisible()
  // Back, then numbers and Enter jump.
  await page.keyboard.press('ArrowLeft')
  await expect(stage).toHaveAttribute('data-current', 'p')
  await page.keyboard.type('2')
  await page.keyboard.press('Enter')
  await expect(stage).toHaveAttribute('data-current', 'a')

  await page.getByTestId('present-exit').click()
  await expect(stage).toHaveCount(0)
  await expect(mapNode(page, 'Roles')).toHaveCount(0)
  await expect(mapNode(page, 'Hiring')).toHaveClass(/selected/)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
})

test('the interactive HTML export presents with the same steps', async ({ page }, info) => {
  await openProject(page, info.outputPath('export.json'))
  const download = await exportVia(page, /Interactive HTML \(\.html\)/)
  const file = info.outputPath('show.html')
  const html = await readFile((await download.path())!, 'utf8')
  // Vite's viewer build replaces zustand's `import.meta.env` check; a quick
  // local build with Bun leaves it in, which a classic <script> cannot parse.
  await writeFile(file, html.replaceAll('import.meta.env', 'undefined'))

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`file://${file}`)
  expect(errors).toEqual([])
  await page.getByTestId('viewer-present').click()
  const stage = page.getByRole('dialog', { name: 'Presenting Show map' })
  await expect(stage).toHaveAttribute('data-current', 'r')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(stage).toHaveAttribute('data-current', 'b')
  // A click goes on too.
  await stage.click({ position: { x: 20, y: 20 } })
  await expect(stage).toHaveAttribute('data-current', 'p')
  await expect(page.getByTestId('present-counter')).toHaveText('4 / 5')
  await page.keyboard.press('Escape')
  await expect(stage).toHaveCount(0)
  await expect(page.getByTestId('viewer-present')).toBeVisible()
})
