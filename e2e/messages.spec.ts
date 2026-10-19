import { expect, test, type Page } from '@playwright/test'

/**
 * H-0: text for lazily loaded dialogs ships with their chunk. If a table were
 * missing, `t` would show the raw key ("sync.title"), so no such key may be
 * visible in the Sync and Presets dialogs (and the preset editor), in either
 * language.
 */
const RAW_KEY = /\b(sync|presets|editor|github|snapshots|trash|marks|common)\.[a-z]\w*/

async function expectNoRawKeys(page: Page) {
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(RAW_KEY)
  const labels = await page
    .locator('[aria-label], [title], [placeholder]')
    .evaluateAll((elements) =>
      elements.flatMap((element) =>
        ['aria-label', 'title', 'placeholder'].map((name) => element.getAttribute(name) ?? ''),
      ),
    )
  expect(labels.join('\n')).not.toMatch(RAW_KEY)
}

const LANGUAGES = [
  {
    locale: 'en',
    start: 'Start a new project',
    project: 'Project ▾',
    sync: 'Sync folder…',
    syncTitle: 'Sync folder',
    presets: 'Presets',
    newPreset: 'New preset…',
    close: 'Close',
  },
  {
    locale: 'zh-CN',
    start: '新建项目',
    project: '项目 ▾',
    sync: '同步文件夹…',
    syncTitle: '同步文件夹',
    presets: '样式',
    newPreset: '新建预设…',
    close: '关闭',
  },
]

for (const language of LANGUAGES) {
  test.describe(`dialog text is loaded (H-0, ${language.locale})`, () => {
    test.use({ locale: language.locale })

    test('the Sync and Presets dialogs show no raw message keys', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: language.start }).click()
      await expect(page.getByRole('button', { name: language.project })).toBeVisible()

      await page.getByRole('button', { name: language.project }).click()
      await page.getByRole('menuitem', { name: language.sync }).click()
      const sync = page.getByTestId('sync-dialog')
      await expect(sync).toContainText(language.syncTitle)
      await expectNoRawKeys(page)
      await sync.getByRole('button', { name: language.close }).click()
      await expect(sync).toHaveCount(0)

      await page.getByRole('button', { name: language.presets }).click()
      const presets = page.getByRole('dialog', { name: language.presets })
      await expect(presets).toBeVisible()
      await expectNoRawKeys(page)
      await presets.getByRole('button', { name: language.newPreset }).click()
      await expect(page.getByRole('dialog').last()).toBeVisible()
      await expectNoRawKeys(page)
    })
  })
}
