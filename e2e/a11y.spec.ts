import { expect, test } from '@playwright/test'
import { addChild, newProject } from './helpers.ts'

test.describe('dark system setting (#86)', () => {
  test.use({ colorScheme: 'dark' })

  test('the start screen and a new project follow the device into dark mode', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start a new project' })).toBeVisible()
    const background = () =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as {
              getComputedStyle(element: unknown): { backgroundColor: string }
              document: { documentElement: unknown }
            }
          ).getComputedStyle(
            (globalThis as unknown as { document: { documentElement: unknown } }).document
              .documentElement,
          ).backgroundColor,
      )
    const isDark = (rgb: string) => {
      const [r, g, b] = (rgb.match(/\d+/g) ?? ['255', '255', '255']).map(Number)
      return (r + g + b) / 3 < 80
    }
    expect(isDark(await background())).toBe(true)

    await page.getByRole('button', { name: 'Start a new project' }).click()
    await expect(page.getByTestId('map-canvas')).toBeVisible()
    expect(isDark(await background())).toBe(true)

    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(async () => isDark(await background())).toBe(false)
  })
})

test('#85: map edits are announced to screen readers', async ({ page }) => {
  await newProject(page)
  await addChild(page, 'Spoken idea')
  const region = page.getByTestId('announcer')
  await expect(region).toHaveAttribute('aria-live', 'polite')
  await expect(region).toContainText('Renamed to “Spoken idea”')
  await page.keyboard.press('Delete')
  await expect(region).toContainText('Deleted “Spoken idea”')
  await expect(page.getByRole('group', { name: /^Untitled project, central topic/ })).toBeVisible()
})
