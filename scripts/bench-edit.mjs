#!/usr/bin/env node
/**
 * Edit latency on a big map (#97). Opens a generated ~1,570-node project in
 * headless Chromium and times the edits people make all the time, from the key
 * press to the next frame:
 *
 *   add     Tab on the central topic → the new child's rename box is on screen
 *   addDeep the same on a topic two levels down (the everyday case)
 *   commit  Enter in that box → the named node is on screen
 *   rename  F2, type, Enter → the new title is on screen
 *   delete  Delete → the node is gone
 *   arrow   ArrowRight → the first child is selected
 *
 * Usage: node scripts/bench-edit.mjs [baseURL] [--runs N] [--json]
 * The app must already be served (npm run preview, or the dev server).
 * Informational only: timings depend on the machine.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const baseURL = args.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:4173'
const runsAt = args.indexOf('--runs')
const RUNS = runsAt >= 0 ? Number(args[runsAt + 1]) : 7
const asJson = args.includes('--json')

/** 10 branches × 12 children × 12 grandchildren (+ root) = 1,571 nodes. */
export function bigProject() {
  let n = 0
  const node = (title, children) => ({ id: `n${n++}`, title, ...(children ? { children } : {}) })
  const map = node(
    'Big map',
    Array.from({ length: 10 }, (_, b) =>
      node(
        `Branch ${b + 1}`,
        Array.from({ length: 12 }, (_, c) =>
          node(
            `Topic ${b + 1}.${c + 1}`,
            Array.from({ length: 12 }, (_, g) => node(`Idea ${b + 1}.${c + 1}.${g + 1}`)),
          ),
        ),
      ),
    ),
  )
  return {
    kind: 'project',
    schemaVersion: 1,
    name: 'Bench',
    preset: 'corporate',
    map,
    brainstorm: { id: 'b-root', title: 'Ideas' },
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'bench-'))
  const file = join(dir, 'big.json')
  await writeFile(file, JSON.stringify(bigProject()))

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(baseURL)
  const choosing = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import or restore…' }).click()
  await (await choosing).setFiles(file)
  await page.locator('.react-flow__node').first().waitFor()
  await page.waitForTimeout(1500)
  const selectRoot = async () => {
    // Fit the map so the central topic is rendered, then select it.
    await page.locator('.react-flow__controls-fitview').click()
    await page.waitForTimeout(300)
    await page
      .locator('.react-flow__node')
      .filter({ has: page.locator('.map-node-title', { hasText: /^Big map$/ }) })
      .click()
    await page.waitForTimeout(300)
  }

  // Helpers live in the page so only the app's own work is timed, not
  // Playwright's round trips.
  await page.evaluate(() => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
    const until = async (check) => {
      for (let i = 0; i < 2000; i++) {
        if (check()) return
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      throw new Error('timed out')
    }
    const key = (target, key) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    const input = () => document.querySelector('input.map-node-input')
    const setValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const hasTitle = (title) =>
      [...document.querySelectorAll('.map-node-title')].some((el) => el.textContent === title)
    // The details panel names the selected node even when it is scrolled out of view.
    const current = () => document.querySelector('[data-testid="node-details-title"]')?.textContent
    const timed = async (action, done) => {
      const start = performance.now()
      action()
      await until(done)
      await frame()
      return performance.now() - start
    }
    const pause = () => new Promise((resolve) => setTimeout(resolve, 150))

    /** One round of edits, starting with the central topic selected. */
    globalThis.__benchRound = async (name) => {
      const out = {}
      // The same add, one level down: under a topic in view, the usual case.
      key(document.body, 'ArrowRight')
      await until(() => /^Branch /.test(current() ?? ''))
      key(document.body, 'ArrowRight')
      await until(() => /^Topic /.test(current() ?? ''))
      await pause()
      out.addDeep = await timed(
        () => key(document.body, 'Tab'),
        () => Boolean(input()),
      )
      key(input(), 'Escape')
      await until(() => !input())
      await pause()
      key(document.body, 'ArrowLeft')
      await until(() => /^Branch /.test(current() ?? ''))
      key(document.body, 'ArrowLeft')
      await until(() => current() === 'Big map')
      await pause()

      out.arrow = await timed(
        () => key(document.body, 'ArrowRight'),
        () => current() !== 'Big map',
      )
      key(document.body, 'ArrowLeft')
      await until(() => current() === 'Big map')
      await pause()

      out.add = await timed(
        () => key(document.body, 'Tab'),
        () => Boolean(input()),
      )
      setValue(input(), name)
      out.commit = await timed(
        () => key(input(), 'Enter'),
        () => !input() && hasTitle(name),
      )
      await pause()

      out.rename = await timed(
        () => key(document.body, 'F2'),
        () => Boolean(input()),
      )
      setValue(input(), `${name} renamed`)
      out.rename += await timed(
        () => key(input(), 'Enter'),
        () => !input() && hasTitle(`${name} renamed`),
      )
      await pause()

      out.delete = await timed(
        () => key(document.body, 'Delete'),
        () => !hasTitle(`${name} renamed`),
      )
      await pause()

      return out
    }
  })

  const timings = { add: [], addDeep: [], commit: [], rename: [], delete: [], arrow: [] }
  for (let i = 0; i < RUNS; i++) {
    await selectRoot()
    const round = await page.evaluate((name) => globalThis.__benchRound(name), `Bench node ${i}`)
    for (const [k, v] of Object.entries(round)) timings[k].push(v)
  }

  await browser.close()
  const summary = Object.fromEntries(
    ['add', 'addDeep', 'commit', 'rename', 'delete', 'arrow'].map((k) => [
      k,
      Math.round(median(timings[k])),
    ]),
  )
  if (asJson) console.log(JSON.stringify(summary))
  else {
    console.log(`Edit latency, median of ${RUNS} runs, 1,571-node map (${baseURL}):`)
    for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(7)} ${v} ms`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
