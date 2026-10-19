import { expect, test, type Page } from '@playwright/test'
import { installFakeFolder } from './fakeFolder.ts'
import { addChild, mapNode, newProject, toast } from './helpers.ts'

type FolderWindow = {
  __syncFolder: {
    files: Map<string, { text: string }>
    put(name: string, text: string): void
    permission: 'granted' | 'prompt'
  }
}

const folderFiles = (page: Page) =>
  page.evaluate(() =>
    [...(globalThis as unknown as FolderWindow).__syncFolder.files.keys()].filter((name) =>
      name.endsWith('.mindmap.json'),
    ),
  )

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installFakeFolder)
})

test('#107/#108: link a folder; projects are written to it as files', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Benchtop')
  await page.getByRole('button', { name: 'Project ▾' }).click()
  await page.getByRole('menuitem', { name: 'Sync folder…' }).click()
  const dialog = page.getByTestId('sync-dialog')
  await expect(dialog).toContainText('Always keep on this device')
  await dialog.getByTestId('sync-link').click()
  await expect(dialog.getByTestId('sync-dialog-status')).toContainText('Up to date')
  await expect(page.getByTestId('sync-badge')).toHaveText(/Synced/)

  await expect
    .poll(() => folderFiles(page))
    .toEqual([expect.stringMatching(/^Untitled project \([\w-]{10}\)\.mindmap\.json$/)])
  const content = await page.evaluate(() => {
    const folder = (globalThis as unknown as FolderWindow).__syncFolder
    const name = [...folder.files.keys()].find((n) => n.endsWith('.mindmap.json'))!
    return JSON.parse(folder.files.get(name)!.text)
  })
  expect(content).toMatchObject({ kind: 'project', name: 'Untitled project' })
  expect(content.map.children[0].title).toBe('Benchtop')
})

test('#110: a change made on the other computer arrives when the window regains focus', async ({
  page,
}) => {
  await newProject(page)
  await page.getByRole('button', { name: 'Project ▾' }).click()
  await page.getByRole('menuitem', { name: 'Sync folder…' }).click()
  await page.getByTestId('sync-link').click()
  await page.getByTestId('sync-dialog').getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => folderFiles(page)).toHaveLength(1)

  // "The laptop" edits the file.
  await page.evaluate(() => {
    const folder = (globalThis as unknown as FolderWindow).__syncFolder
    const name = [...folder.files.keys()].find((n) => n.endsWith('.mindmap.json'))!
    const doc = JSON.parse(folder.files.get(name)!.text)
    doc.map.children = [{ id: 'laptop-1', title: 'Added on the laptop' }]
    doc.updatedAt = '2099-01-01T00:00:00.000Z'
    folder.put(name, JSON.stringify(doc))
  })
  await page.evaluate(() => {
    const g = globalThis as unknown as {
      dispatchEvent(e: unknown): void
      Event: new (type: string) => unknown
    }
    g.dispatchEvent(new g.Event('focus'))
  })
  await expect(mapNode(page, 'Added on the laptop')).toBeVisible()
  await expect(toast(page)).toContainText('newer version from your other computer')
  // Undo brings this computer's version back.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(mapNode(page, 'Added on the laptop')).toHaveCount(0)
})

test('#107: the start screen offers folder sync even with no projects yet', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('start-sync').click()
  await page.getByTestId('sync-link').click()
  await expect(page.getByTestId('sync-dialog-status')).toContainText('Up to date')
  await page.getByTestId('sync-unlink').click()
  await expect(page.getByTestId('sync-link')).toBeVisible()
})

test('#118: the start screen shows sync status and asks to reconnect there', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('start-sync').click()
  await page.getByTestId('sync-link').click()
  await expect(page.getByTestId('sync-dialog-status')).toContainText('Up to date')
  await page.getByTestId('sync-dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('sync-badge')).toHaveText(/Synced/)

  // The browser wants permission again (as after a restart).
  await page.evaluate(() => {
    const g = globalThis as unknown as FolderWindow & {
      dispatchEvent(e: unknown): void
      Event: new (type: string) => unknown
    }
    g.__syncFolder.permission = 'prompt'
    g.dispatchEvent(new g.Event('focus'))
  })
  await expect(page.getByTestId('sync-reconnect-prompt')).toBeVisible()
  await expect(page.getByTestId('sync-badge')).toHaveText(/Reconnect folder/)
  await page.getByTestId('start-sync-reconnect').click()
  await expect(page.getByTestId('sync-reconnect-prompt')).toHaveCount(0)
  await expect(page.getByTestId('sync-badge')).toHaveText(/Synced/)
})
