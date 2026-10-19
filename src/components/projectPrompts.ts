import { useProjects } from '../store/projects'
import { askText, MAX_NAME_CHARS, nameProblem } from './promptStore'
import { announceSnapshot } from './snapshotFeedback'
import { showToast } from './toastStore'
import { t } from '../i18n'

/**
 * Save As and Save snapshot, asked through the themed PromptDialog (#77).
 * Shared by the toolbar and the command palette so both behave the same —
 * the palette's Save As used to give no feedback at all.
 */
export async function askSaveAs(): Promise<string | null> {
  const current = useProjects.getState().current
  if (!current) return null
  const name = await askText({
    title: t('prompt.saveAsTitle'),
    label: t('prompt.saveAsLabel'),
    initial: t('prompt.copySuffix', { name: current.name }).slice(0, MAX_NAME_CHARS),
    confirmLabel: t('prompt.saveAsAccept'),
    maxLength: MAX_NAME_CHARS,
    validate: nameProblem,
  })
  if (name === null) return null
  const id = await useProjects.getState().saveAs(name)
  if (id) showToast(t('toast.savedAs', { name: name.trim() }))
  else showToast(t('toast.saveAsFailed'), 'error')
  return id
}

export async function askSnapshotName(): Promise<boolean> {
  if (!useProjects.getState().current) return false
  const name = await askText({
    title: t('prompt.snapshotTitle'),
    label: t('prompt.snapshotLabel'),
    confirmLabel: t('prompt.snapshotAccept'),
    maxLength: MAX_NAME_CHARS,
    validate: nameProblem,
  })
  if (name === null) return false
  const snapshot = await useProjects.getState().createSnapshot(name)
  announceSnapshot(name, snapshot)
  return snapshot !== null
}
