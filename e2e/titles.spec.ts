import { expect, test, type Page } from '@playwright/test'
import { addChild, mapNode, newProject } from './helpers.ts'

// #72: node boxes are sized from measured text, so titles are never clipped and
// Latin words never break in the middle.

const TITLES = [
  'Research',
  'Design',
  '产品路线图与季度目标规划',
  'WWWWWW MMMMM',
  'A fairly long idea title that should wrap across two or three lines nicely',
]

async function titleMetrics(page: Page) {
  return page.$$eval('.map-node-title', (elements) =>
    elements.map((element) => {
      const text = element.textContent ?? ''
      const node = element.firstChild
      // Character indexes where a new rendered line starts.
      const breaks: number[] = []
      if (node && node.nodeType === 3) {
        const range = element.ownerDocument.createRange()
        let lastTop: number | null = null
        for (let i = 0; i < text.length; i += 1) {
          range.setStart(node, i)
          range.setEnd(node, i + 1)
          const rect = range.getClientRects()[0]
          if (!rect) continue
          if (lastTop !== null && rect.top > lastTop + 2) breaks.push(i)
          lastTop = rect.top
        }
      }
      const box = element.parentElement!
      return {
        text,
        breaks,
        clippedY:
          element.scrollHeight > element.clientHeight + 1 ||
          box.scrollHeight > box.clientHeight + 1,
        clippedX: element.scrollWidth > element.clientWidth + 1,
      }
    }),
  )
}

test('#72: titles are never clipped and Latin words never split mid-word', async ({ page }) => {
  await newProject(page)
  for (const title of TITLES) {
    await addChild(page, title)
    await mapNode(page, 'Untitled project').click()
  }
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByRole('button', { name: 'Fit View' }).click()

  const metrics = await titleMetrics(page)
  expect(metrics.map((m) => m.text).sort()).toEqual([...TITLES, 'Untitled project'].sort())
  for (const m of metrics) {
    expect(m.clippedY, `"${m.text}" is clipped vertically`).toBe(false)
    expect(m.clippedX, `"${m.text}" is clipped horizontally`).toBe(false)
    if (/^[\x20-\x7e]+$/.test(m.text)) {
      for (const index of m.breaks) {
        expect(m.text[index - 1], `"${m.text}" breaks mid-word at ${index}`).toBe(' ')
      }
    }
  }
})
