import { expect, test } from '@playwright/test'
import { exportVia, newProject } from './helpers.ts'

// Runs against `npm run dev` only (see playwright.config.ts).
test('#55: Interactive HTML export works under npm run dev', async ({ page }) => {
  const viewer = page.waitForResponse((response) =>
    response.url().endsWith('/viewer/viewer.iife.js'),
  )
  await newProject(page)
  const download = await exportVia(page, /Interactive HTML \(\.html\)/)
  expect((await viewer).status()).toBe(200)
  expect(download.suggestedFilename()).toMatch(/\.html$/)
})
