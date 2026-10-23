import { readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { addChild, mapNode } from './helpers.ts'

// The installed app offline: the service worker vite-plugin-pwa generates
// (vite.config.ts, registered in src/pwa/register.ts). The rest of the suite
// blocks service workers; reach.spec.ts (#88) covers the lazily loaded parts
// offline, and this file covers what the precache holds and a map made,
// edited and reloaded with the network off.
test.skip(Boolean(process.env.E2E_BASE_URL), 'needs the built app with its service worker')
test.use({ serviceWorkers: 'allow' })

const DIST = path.resolve(import.meta.dirname, '../dist')
/** Files in dist/ the service worker does not precache: itself and host config. */
const NOT_PRECACHED = /^(sw\.js|workbox-[\w-]+\.js|_headers)$/

/** Every file of the build, relative to dist/, as the precache should hold it. */
function builtFiles(dir = DIST, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix + entry.name
    if (entry.isDirectory()) {
      return relative === '.vite' ? [] : builtFiles(path.join(dir, entry.name), `${relative}/`)
    }
    return NOT_PRECACHED.test(relative) ? [] : [relative]
  })
}

/** Load the app until its service worker controls the page (prompt mode: one reload). */
async function installApp(page: Page): Promise<void> {
  await page.goto('/')
  // `ready` never settles without a registration, so check for one first.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const nav = globalThis.navigator as unknown as {
            serviceWorker: { getRegistrations: () => Promise<unknown[]> }
          }
          return (await nav.serviceWorker.getRegistrations()).length
        }),
      { message: 'the app should register its service worker (src/pwa/register.ts)' },
    )
    .toBeGreaterThan(0)
  await page.evaluate(async () => {
    const nav = globalThis.navigator as unknown as { serviceWorker: { ready: Promise<unknown> } }
    await nav.serviceWorker.ready
  })
  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = globalThis.navigator as unknown as { serviceWorker: { controller?: unknown } }
        return Boolean(nav.serviceWorker.controller)
      }),
    )
    .toBe(true)
}

/** The paths the precache holds, relative to the app's root, without Workbox's revision query. */
async function precachedFiles(page: Page): Promise<string[]> {
  const urls = await page.evaluate(async () => {
    type Cache = { keys: () => Promise<{ url: string }[]> }
    const storage = (
      globalThis as unknown as {
        caches: { keys: () => Promise<string[]>; open: (name: string) => Promise<Cache> }
      }
    ).caches
    const names = (await storage.keys()).filter((name) => name.startsWith('workbox-precache'))
    const requests = await Promise.all(names.map(async (name) => (await storage.open(name)).keys()))
    return requests.flat().map((request) => request.url)
  })
  const root = new URL(page.url())
  return urls.map((url) => decodeURIComponent(new URL(url).pathname).slice(root.pathname.length))
}

test('the service worker precaches every file of the build', async ({ page }) => {
  await installApp(page)
  // A file added to public/ but not to the precache would 404 offline (#67).
  expect((await precachedFiles(page)).sort()).toEqual(builtFiles().sort())
})

test('a map made and edited offline is still there after an offline reload', async ({
  page,
  context,
}) => {
  await installApp(page)
  await context.setOffline(true)
  await page.reload()

  // The map canvas is a lazily loaded chunk, so this also loads it from the cache.
  await page.getByRole('button', { name: 'Start a new project' }).click()
  await expect(mapNode(page, 'Untitled project')).toBeVisible()
  await addChild(page, 'Offline idea')
  await mapNode(page, 'Offline idea').click()
  const notes = page.getByTestId('node-details-notes')
  await notes.click()
  await page.keyboard.type('written with the network off')
  await notes.blur()
  await expect(page.getByTestId('save-status')).toHaveText('Saved')

  // Still offline: the reload is served by the service worker and reopens the project (#75).
  await page.reload()
  await expect(mapNode(page, 'Offline idea')).toBeVisible()
  await mapNode(page, 'Offline idea').click()
  await expect(page.getByTestId('node-details-notes')).toHaveValue('written with the network off')

  // The other views are lazily loaded chunks too.
  await page.getByRole('tab', { name: 'Outline' }).click()
  await expect(page.getByText('Offline idea').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Brainstorm' }).click()
  await expect(page.getByRole('tab', { name: 'Brainstorm' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(
    await page.evaluate(() => (globalThis.navigator as unknown as { onLine: boolean }).onLine),
  ).toBe(false)
  await context.setOffline(false)
})
