import { expect, test } from '@playwright/test'
import { newProject } from './helpers.ts'

test('#94: a part of the app missing after a deploy shows the reload banner', async ({ page }) => {
  await newProject(page)
  // Simulate a deploy: every script not loaded yet is gone from the server.
  await page.route('**/*.js', (route) => route.fulfill({ status: 404, body: 'Not found' }))

  await page.getByRole('button', { name: 'Presets' }).click()
  const banner = page.getByTestId('update-banner')
  await expect(banner).toContainText('This part of the app was updated')
  // The dialog closes instead of taking the app down with it.
  await expect(page.getByRole('dialog', { name: 'Presets' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Mind Map' })).toBeVisible()

  // Reload (with the "deploy" over) brings back a working app.
  await page.unroute('**/*.js')
  await page.getByTestId('update-reload').click()
  await expect(banner).toHaveCount(0)
  await page.getByRole('button', { name: 'Presets' }).click()
  await expect(page.getByRole('dialog', { name: 'Presets' })).toBeVisible()
})

test('#94: Later hides the banner and work goes on', async ({ page }) => {
  await newProject(page)
  await page.route('**/*.js', (route) => route.fulfill({ status: 404, body: 'Not found' }))
  await page.getByRole('button', { name: 'Presets' }).click()
  await expect(page.getByTestId('update-banner')).toBeVisible()
  await page.getByTestId('update-later').click()
  await expect(page.getByTestId('update-banner')).toHaveCount(0)
  await page.keyboard.press('Tab')
  await expect(page.locator('input.map-node-input')).toBeFocused()
})
