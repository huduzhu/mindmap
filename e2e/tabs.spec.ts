import { expect, test } from '@playwright/test'
import { addChild, mapNode, newProject, projectMenu, renameProject, toast } from './helpers.ts'

// #53: two tabs (or the installed PWA plus a tab) on one project.
test('#53: a stale tab never overwrites newer work; it keeps its edit as a conflict copy', async ({
  context,
}) => {
  const first = await context.newPage()
  // Freeze the first tab's timers so its 800 ms autosave cannot fire on its own:
  // the test decides exactly when each tab writes.
  await first.clock.install()
  await newProject(first)
  await renameProject(first, 'Shared')
  await projectMenu(first, 'Save')

  const second = await context.newPage()
  // ?home: this tab would otherwise reopen the project the first tab just opened (#75).
  await second.goto('/?home')
  await second.getByRole('button', { name: 'Shared', exact: true }).click()
  await expect(mapNode(second, 'Shared')).toBeVisible()

  // Edit in the first tab but do not let it save yet (autosave waits 800 ms)…
  await first.bringToFront()
  await mapNode(first, 'Shared').click()
  await first.keyboard.press('Tab')
  await first.locator('input.map-node-input').fill('From tab one')
  await first.locator('input.map-node-input').press('Enter')

  // …while the second tab edits and saves immediately.
  await second.bringToFront()
  await mapNode(second, 'Shared').click()
  await addChild(second, 'From tab two')
  await projectMenu(second, 'Save')

  // The first tab's save now loses the race and must not overwrite.
  await first.bringToFront()
  await projectMenu(first, 'Save')
  await expect(toast(first)).toContainText('conflict copy')
  await expect(mapNode(first, 'From tab two')).toBeVisible()
  // The conflict copy is in the library: Project ▾ → Open… lists it.
  await projectMenu(first, 'Open…')
  await expect(first.getByTestId('command-list')).toContainText('Open “Shared (conflict copy)”')
})
