import { expect, test, type Page } from '@playwright/test'
import { addChild, newProject, projectMenu, toast } from './helpers.ts'

/**
 * A small GitHub for #149: files by path (base64), contents PUTs in order,
 * folder listings, raw reads and the project's commits. Refs are ignored:
 * every read sees the latest files.
 */
async function serveGitHub(page: Page) {
  const files = new Map<string, string>()
  const puts: string[] = []
  const commits: { sha: string; message: string }[] = []
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = { 'access-control-allow-origin': '*' }
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      })
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          ...headers,
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET, PUT, POST',
        },
      })
    }
    if (url.pathname === '/repos/me/maps')
      return json(200, { private: true, default_branch: 'main' })
    const prefix = '/repos/me/maps/contents/'
    if (url.pathname.startsWith(prefix)) {
      const path = decodeURIComponent(url.pathname.slice(prefix.length))
      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as { message: string; content: string }
        files.set(path, body.content)
        puts.push(path)
        const sha = `sha${puts.length}`.padEnd(10, '0')
        if (path.endsWith('.mindmap.json')) commits.unshift({ sha, message: body.message })
        return json(201, { commit: { sha } })
      }
      const listing = [...files.keys()]
        .filter((name) => name.startsWith(`${path}/`))
        .map((name) => ({ name: name.slice(path.length + 1), type: 'file' }))
      if (listing.length > 0) return json(200, listing)
      const content = files.get(path)
      if (content === undefined) return json(404, { message: 'Not Found' })
      if (request.headers()['accept'] === 'application/vnd.github.raw+json')
        return route.fulfill({ status: 200, headers, body: Buffer.from(content, 'base64') })
      return json(200, { sha: 'blob', encoding: 'base64', content })
    }
    if (url.pathname === '/repos/me/maps/git/refs') return json(201, {})
    if (url.pathname === '/repos/me/maps/commits') {
      return json(
        200,
        commits.map((c) => ({
          sha: c.sha,
          commit: { message: c.message, author: { date: '2026-10-04T09:30:00Z' } },
        })),
      )
    }
    return json(404, { message: 'Not Found' })
  })
  return { files, puts }
}

test('#112b: save a milestone to a private GitHub repo and bring it back as a snapshot', async ({
  page,
}) => {
  const commits: { sha: string; message: string; content: string }[] = []
  const tags: string[] = []
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
      })
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET, PUT, POST',
        },
      })
    }
    if (url.pathname === '/repos/me/maps')
      return json(200, { private: true, default_branch: 'main' })
    if (url.pathname.startsWith('/repos/me/maps/contents/')) {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as { message: string; content: string }
        const sha = `sha${commits.length + 1}`.padEnd(10, '0')
        commits.unshift({ sha, message: body.message, content: body.content })
        return json(201, { commit: { sha } })
      }
      const ref = url.searchParams.get('ref')
      const commit = commits.find((c) => c.sha === ref) ?? commits[0]
      if (!commit) return json(404, { message: 'Not Found' })
      // A raw read gets the file itself (#122); the JSON form has its blob sha.
      if (request.headers()['accept'] === 'application/vnd.github.raw+json') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: Buffer.from(commit.content, 'base64').toString('utf8'),
        })
      }
      return json(200, { sha: 'blob', encoding: 'base64', content: commit.content })
    }
    if (url.pathname === '/repos/me/maps/git/refs' && request.method() === 'POST') {
      tags.push((request.postDataJSON() as { ref: string }).ref)
      return json(201, {})
    }
    if (url.pathname === '/repos/me/maps/commits') {
      return json(
        200,
        commits.map((c) => ({
          sha: c.sha,
          commit: { message: c.message, author: { date: '2026-10-04T09:30:00Z' } },
        })),
      )
    }
    return json(404, { message: 'Not Found' })
  })

  await newProject(page)
  await projectMenu(page, 'Save milestone to GitHub…')
  const dialog = page.getByTestId('github-dialog')
  await dialog.getByTestId('github-repo').fill('me/maps')
  await dialog.getByTestId('github-token').fill('github_pat_test')
  // An unsafe folder is refused before anything is sent.
  await dialog.getByTestId('github-folder').fill('../elsewhere')
  await expect(dialog.getByTestId('github-connect')).toBeDisabled()
  await dialog.getByTestId('github-folder').fill('mindmaps')
  await dialog.getByTestId('github-connect').click()
  await expect(toast(page)).toContainText('Connected to me/maps')

  await dialog.getByTestId('github-message').fill('Quote sent to client')
  await dialog.getByTestId('github-tag').fill('v1.0')
  await dialog.getByTestId('github-save').click()
  await expect(toast(page)).toContainText('Milestone saved to GitHub')
  expect(commits).toHaveLength(1)
  expect(tags).toEqual(['refs/tags/v1.0'])

  await dialog.getByTestId('github-tab-history').click()
  const history = dialog.getByTestId('github-history')
  await expect(history).toContainText('Quote sent to client')
  await history.getByRole('button', { name: /Restore milestone/ }).click()
  await expect(toast(page)).toContainText('Added snapshot')
  await dialog.getByRole('button', { name: 'Close' }).last().click()
  await page.getByRole('button', { name: 'Project ▾' }).click()
  await expect(page.getByRole('menuitem', { name: 'Snapshots (1)…' })).toBeVisible()
})

/** In-page IndexedDB access for the stored pictures, as a script (no DOM types here). */
const ASSETS_SCRIPT = (action: 'clear' | 'count') => `new Promise((resolve, reject) => {
  const open = indexedDB.open('mindmap-studio')
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const tx = open.result.transaction('assets', '${action === 'clear' ? 'readwrite' : 'readonly'}')
    const request = tx.objectStore('assets').${action}()
    tx.oncomplete = () => {
      open.result.close()
      resolve(request.result ?? null)
    }
  }
})`

test('#149: a milestone commits its picture once, and restoring brings the picture back', async ({
  page,
}) => {
  const github = await serveGitHub(page)
  await newProject(page)
  await addChild(page, 'Splashback')
  // A picture pasted on the node (as in images.spec.ts).
  await page.evaluate(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 160
    const context = canvas.getContext('2d')
    context.fillStyle = '#16a34a'
    context.fillRect(0, 0, 320, 160)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const data = new DataTransfer()
    data.items.add(new File([blob], 'tiles.png', { type: 'image/png' }))
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  })()`)
  await expect(page.locator('.map-node-image img')).toBeVisible()

  await projectMenu(page, 'Save milestone to GitHub…')
  const dialog = page.getByTestId('github-dialog')
  await dialog.getByTestId('github-repo').fill('me/maps')
  await dialog.getByTestId('github-token').fill('github_pat_test')
  await dialog.getByTestId('github-connect').click()
  await expect(toast(page)).toContainText('Connected to me/maps')
  await dialog.getByTestId('github-message').fill('Tiles chosen')
  await dialog.getByTestId('github-save').click()
  await expect(toast(page)).toContainText('Milestone saved to GitHub')
  // The picture first, then the project; a second milestone does not commit it again.
  expect(github.puts).toHaveLength(2)
  expect(github.puts[0]).toMatch(/^mindmaps\/assets\/sha256-[0-9a-f]{64}\.webp$/)
  expect(github.puts[1]).toMatch(/^mindmaps\/.+\.mindmap\.json$/)
  await dialog.getByTestId('github-message').fill('Second')
  await dialog.getByTestId('github-save').click()
  await expect.poll(() => github.puts.length).toBe(3)
  expect(github.puts[2]).toMatch(/\.mindmap\.json$/)

  // This browser loses the picture; restoring the milestone fetches it.
  await page.evaluate(ASSETS_SCRIPT('clear'))
  expect(await page.evaluate(ASSETS_SCRIPT('count'))).toBe(0)
  await dialog.getByTestId('github-tab-history').click()
  const history = dialog.getByTestId('github-history')
  await expect(history).toContainText('Tiles chosen')
  await history
    .getByRole('button', { name: /Restore milestone/ })
    .first()
    .click()
  await expect(toast(page)).toContainText('Added snapshot')
  expect(await page.evaluate(ASSETS_SCRIPT('count'))).toBe(1)
})
