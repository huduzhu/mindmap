import { expect, test } from '@playwright/test'
import { addChild, mapNode, newProject, redoAll, undoAll } from './helpers.ts'

test('#45: one notes edit is one undo step, and undo is not re-committed on blur', async ({
  page,
}) => {
  await newProject(page)
  await addChild(page, 'Idea')
  const creationSteps = await undoAll(page)
  await redoAll(page)
  const undo = page.getByRole('button', { name: 'Undo' })
  const notes = page.getByTestId('node-details-notes')

  await mapNode(page, 'Idea').click()
  await notes.fill('first draft')
  // Clicking another node blurs the textarea and unmounts the panel. Before #45
  // that committed twice.
  await mapNode(page, 'Untitled project').click()
  await mapNode(page, 'Idea').click()
  await expect(notes).toHaveValue('first draft')

  await undo.click()
  // The textarea follows the undo on the same node…
  await expect(notes).toHaveValue('')
  // …and moving away does not write the undone text back.
  await mapNode(page, 'Untitled project').click()
  await mapNode(page, 'Idea').click()
  await expect(notes).toHaveValue('')
  // Exactly the creation steps remain: the notes edit was a single step.
  expect(await undoAll(page)).toBe(creationSteps)
  await expect(mapNode(page, 'Idea')).toHaveCount(0)
})
