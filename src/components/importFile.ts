import type {
  ApplyAction,
  ApplyPreview,
  ExpandAction,
  ExpandPreview,
  ImportBranch,
} from '../io/import'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { findNode } from '../store/treeOps'
import { pastePayload } from './clipboardActions'
import { lazyImport } from '../pwa/update'
import { askChoice } from './choiceStore'
import { t, tn } from '../i18n'
import { announceImport, showToast } from './toastStore'

// Far above any realistic project, low enough that a mistaken multi-GB drop is
// refused before it is read into memory (#65).
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024
// A whole-library backup can legitimately be much larger than one project.
// As large as the biggest backup the app writes (#157, io/unzip.ts).
export const MAX_BACKUP_BYTES = 1024 * 1024 * 1024

/** File types the Import pickers offer: projects, outlines and library backups (#82). */
export const IMPORT_ACCEPT = '.json,.md,.markdown,.txt,.zip'

export function isBackupFile(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip'
}

export async function importAndAnnounce(file: File): Promise<void> {
  try {
    const backup = isBackupFile(file)
    const limit = backup ? MAX_BACKUP_BYTES : MAX_IMPORT_BYTES
    if (file.size > limit) {
      const mb = (file.size / (1024 * 1024)).toFixed(0)
      showToast(
        t('import.tooBig', { name: file.name, mb, limit: limit / (1024 * 1024) }),
        'error',
        9000,
      )
      return
    }
    let name = file.name
    let text: string
    if (backup) {
      const { describeRestore, openZipFile } = await lazyImport(() => import('../io/backup'))
      // A library backup, or a project exported with its images (#149).
      const opened = await openZipFile(new Uint8Array(await file.arrayBuffer()))
      if (opened.kind === 'backup') {
        const { result } = opened
        if (result.ok) showToast(describeRestore(result), 'info', 9000)
        else showToast(t('import.restoreFailed', { error: result.error }), 'error', 9000)
        return
      }
      name = opened.name
      text = opened.text
    } else text = await file.text()
    // The importer (and the precompiled schema validators) is a separate chunk (#88).
    const { importFileText, readBranch } = await lazyImport(() => import('../io/import'))
    // With a project open, an outline or a map can go into it as a branch (#102).
    const { current, currentId } = useProjects.getState()
    const branch = current ? await readBranch(name, text, currentId) : null
    if (branch) {
      const choice = await askBranchAction(branch)
      if (choice === null) return
      if (choice === 'branch') {
        if (pastePayload(branch.payload, 'child')) {
          showToast(tn('importBranch.done', branch.count, { name: branch.title }))
        }
        return
      }
    }
    announceImport(
      await importFileText(name, text, {
        chooseExpandAction: askExpandAction,
        chooseApplyAction: askApplyAction,
      }),
    )
  } catch (err) {
    // Callers use `void importAndAnnounce(...)`, so an uncaught throw here
    // would become an unhandled rejection with nothing surfaced to the user.
    showToast(
      t('import.failed', { error: err instanceof Error ? err.message : String(err) }),
      'error',
      9000,
    )
  }
}

/** Download every project, snapshot and custom preset as one ZIP (#82). */
export async function backUpLibrary(): Promise<boolean> {
  try {
    const { downloadLibraryBackup, partialBackupNote } = await lazyImport(
      () => import('../io/backup'),
    )
    const manifest = await downloadLibraryBackup()
    // Storage could not be read in full: say what may be missing (#158).
    if (manifest.partial) showToast(partialBackupNote(manifest), 'error', 12000)
    else showToast(tn('backup.done', manifest.projects.length))
    return true
  } catch (err) {
    showToast(
      t('backup.failed', { error: err instanceof Error ? err.message : String(err) }),
      'error',
      9000,
    )
    return false
  }
}

/**
 * The #84 merge preview: what an LLM "expand" file would change, and whether
 * to merge it into its source project (the default, decision K-D1), import
 * it as a separate project, or cancel.
 */
export function askExpandAction(preview: ExpandPreview): Promise<ExpandAction | null> {
  const details = [tn('expand.added', preview.added)]
  if (preview.changed > 0) details.push(tn('expand.changed', preview.changed))
  if (preview.moved > 0) details.push(tn('expand.moved', preview.moved))
  if (preview.removed > 0) details.push(tn('expand.removed', preview.removed))
  const clean = preview.changed + preview.moved + preview.removed === 0
  return askChoice<ExpandAction>({
    title: t('expand.title'),
    message: t('expand.message', { name: preview.sourceName }) + (clean ? '' : t('expand.warning')),
    details,
    choices: [
      {
        value: 'merge',
        label: t('expand.merge', { name: preview.sourceName }),
        detail: t('expand.mergeDetail'),
        tone: 'primary',
      },
      {
        value: 'new',
        label: t('expand.new'),
        detail: t('expand.newDetail', { name: preview.sourceName }),
      },
    ],
  })
}

/**
 * An AI "convert" or "improve" reply that names its source project: put it
 * into that project (the default, like #84's merge), import it separately, or
 * cancel.
 */
export function askApplyAction(preview: ApplyPreview): Promise<ApplyAction | null> {
  const name = preview.sourceName
  const convert = preview.intent === 'convert'
  const details = [tn('apply.incoming', preview.mapNodes)]
  details.push(
    preview.currentMapNodes > 0
      ? tn('apply.current', preview.currentMapNodes)
      : t('apply.currentEmpty'),
  )
  return askChoice<ApplyAction>({
    title: t(convert ? 'apply.convertTitle' : 'apply.improveTitle'),
    message: t(convert ? 'apply.convertMessage' : 'apply.improveMessage', { name }),
    details,
    choices: [
      {
        value: 'apply',
        label: t(convert ? 'apply.convertApply' : 'apply.improveApply', { name }),
        detail: t(convert ? 'apply.convertApplyDetail' : 'apply.improveApplyDetail'),
        tone: 'primary',
      },
      { value: 'new', label: t('apply.new'), detail: t('apply.newDetail', { name }) },
    ],
  })
}

/**
 * A file dropped or imported while a project is open (#102): add it under the
 * selected node (one undo step), or open it as a new project as before.
 */
export function askBranchAction(branch: ImportBranch): Promise<'branch' | 'new' | null> {
  const { view, activeSection, selection } = useEditor.getState()
  const section =
    view === 'map' || view === 'outline'
      ? 'map'
      : view === 'brainstorm'
        ? 'brainstorm'
        : activeSection
  const tree = useProjects.getState().current?.[section]
  const target = (selection && tree ? findNode(tree, selection)?.node : null) ?? tree
  const targetName = target?.title.trim() || t('common.untitled')
  return askChoice<'branch' | 'new'>({
    title: t('importBranch.title'),
    message: t('importBranch.message', { name: branch.title }),
    details: [tn('importBranch.size', branch.count)],
    choices: [
      {
        value: 'new',
        label: t('importBranch.new'),
        detail: t('importBranch.newDetail'),
        tone: 'primary',
      },
      {
        value: 'branch',
        label: t('importBranch.add', { name: targetName }),
        detail: t('importBranch.addDetail'),
      },
    ],
  })
}
