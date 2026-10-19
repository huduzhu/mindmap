import { expect, type Download, type Page } from '@playwright/test'

/** Open the app on a fresh profile and start a new project. */
export async function newProject(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await expect(page.getByRole('tab', { name: 'Mind Map' })).toBeVisible()
  await expect(mapNode(page, 'Untitled project')).toBeVisible()
  // No click on the root: a new project opens with it selected (#71), and the
  // canvas specs' first Tab depends on that.
}

/** A node on the mind-map canvas, by its visible title. */
export function mapNode(page: Page, title: string) {
  return page.locator('.react-flow__node').filter({
    has: page.locator('.map-node-title', { hasText: new RegExp(`^${escapeRegExp(title)}$`) }),
  })
}

/** The inline rename input that the canvas opens for a new or F2-renamed node. */
export function canvasRenameInput(page: Page) {
  return page.locator('input.map-node-input')
}

/** Press Tab on the selected node, name the new child and commit it. */
export async function addChild(page: Page, title: string): Promise<void> {
  await page.keyboard.press('Tab')
  const input = canvasRenameInput(page)
  await expect(input).toBeFocused()
  await input.fill(title)
  await input.press('Enter')
  await expect(mapNode(page, title)).toBeVisible()
}

export async function renameProject(page: Page, name: string): Promise<void> {
  await page.locator('button.toolbar-project-name-button').click()
  const input = page.locator('input.toolbar-project-name-input')
  await input.fill(name)
  await input.press('Enter')
  await expect(page.locator('button.toolbar-project-name-button')).toHaveText(name)
}

/** Pick an item from the toolbar's Project menu (#76). */
export async function projectMenu(page: Page, item: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Project ▾' }).click()
  // Exact: "Save" must not also match "Save As…" and "Save snapshot…".
  await page.getByRole('menuitem', { name: item, exact: typeof item === 'string' }).click()
}

/** Pick an item from the toolbar's Export menu and return the download. */
export async function exportVia(page: Page, item: string | RegExp): Promise<Download> {
  await page.getByRole('button', { name: 'Export ▾' }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: item }).click()
  return downloading
}

/** The text of the toast at the bottom of the screen (without its × button). */
export function toast(page: Page) {
  return page.locator('.toast .toast-message')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Click Undo until it disables and return how many steps there were; `redoAll`
 * puts them back. There is no store bridge in the built app, so this is how the
 * specs measure the undo stack.
 */
export async function undoAll(page: Page): Promise<number> {
  const undo = page.getByRole('button', { name: 'Undo' })
  let steps = 0
  while (await undo.isEnabled()) {
    await undo.click()
    steps += 1
    if (steps > 200) throw new Error('undoAll: Undo never disabled')
  }
  return steps
}

export async function redoAll(page: Page): Promise<number> {
  const redo = page.getByRole('button', { name: 'Redo' })
  let steps = 0
  while (await redo.isEnabled()) {
    await redo.click()
    steps += 1
    if (steps > 200) throw new Error('redoAll: Redo never disabled')
  }
  return steps
}
