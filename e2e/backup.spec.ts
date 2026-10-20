import { expect, test } from '@playwright/test'
import { addChild, newProject, renameProject, toast } from './helpers.ts'

test('#82: back up every project to one ZIP and restore it in a fresh browser', async ({
  page,
  browser,
}, testInfo) => {
  await newProject(page)
  await renameProject(page, 'Alpha plan')
  await addChild(page, 'First idea')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await renameProject(page, 'Beta plan')
  // Beta is still open with its edits possibly unsaved: the backup must use
  // the in-memory copy, so no wait for "Saved" here.
  await page.getByRole('button', { name: 'Home', exact: true }).click()

  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Back up all projects' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^mindmap-backup-\d{4}-\d{2}-\d{2}\.zip$/)
  await expect(toast(page)).toContainText('Backed up 2 projects')
  const zipPath = testInfo.outputPath('backup.zip')
  await download.saveAs(zipPath)

  // A new browser profile: empty IndexedDB, as on another computer.
  const context = await browser.newContext()
  const fresh = await context.newPage()
  await fresh.goto('/')
  await expect(fresh.getByRole('button', { name: 'Start a new project' })).toBeVisible()
  await expect(fresh.getByRole('heading', { name: 'Recent projects' })).toHaveCount(0)

  const choosing = fresh.waitForEvent('filechooser')
  await fresh.getByRole('button', { name: 'Import or restore…' }).click()
  await (await choosing).setFiles(zipPath)

  await expect(toast(fresh)).toContainText('Restored 2 projects')
  await expect(fresh.getByRole('button', { name: 'Alpha plan', exact: true })).toBeVisible()
  await expect(fresh.getByRole('button', { name: 'Beta plan', exact: true })).toBeVisible()
  await context.close()
})

test('#83: the start screen shows how much storage the library uses', async ({ page }) => {
  await page.goto('/')
  const meter = page.getByTestId('storage-meter')
  await expect(meter).toContainText(/Using [\d.]+ (B|KB|MB|GB)/)
  // Headless Chromium grants persistence, or offers the button; either way
  // the user is told where they stand.
  await expect(meter).toContainText(/Protected|may clear this data/)
})
