import type { Preset, Project } from '../schema/types'
import { lazyImport } from '../pwa/update'
import { showToast } from './toastStore'
import { t } from '../i18n'

/**
 * The exporters (HTML/ZIP, PNG/SVG via html-to-image, FreeMind, OPML…) are a
 * separate chunk (#88), fetched on the first export. These wrappers keep the
 * old call sites unchanged and report a failed chunk load instead of throwing
 * into the void.
 */
const load = () => lazyImport(() => import('../io/exporters'))

async function run(action: (m: Awaited<ReturnType<typeof load>>) => unknown) {
  try {
    await action(await load())
  } catch (error) {
    showToast(
      t('toast.exportFailed', { error: error instanceof Error ? error.message : String(error) }),
      'error',
      9000,
    )
  }
}

export const exportProjectJson = (project: Project) => run((m) => m.exportProjectJson(project))
export const exportMarkdownFile = (project: Project) => run((m) => m.exportMarkdownFile(project))
/** The "with images" ZIP exports (#149). */
export const exportProjectZip = (project: Project) => run((m) => m.exportProjectZip(project))
export const exportMarkdownZip = (project: Project) => run((m) => m.exportMarkdownZip(project))
export const exportOpmlFile = (project: Project) => run((m) => m.exportOpmlFile(project))
export const exportFreemindFile = (project: Project) => run((m) => m.exportFreemindFile(project))

/** Rejects on failure: the toolbar reports these itself (with its busy state). */
export async function exportImageFile(
  format: 'png' | 'svg',
  preset: Preset,
  project: Project,
): Promise<void> {
  await (await load()).exportImageFile(format, preset, project)
}

export async function exportHtmlFile(project: Project, preset: Preset, zip: boolean) {
  await (await load()).exportHtmlFile(project, preset, zip)
}

/** "Export this branch…" (#146). Rejects on failure: the dialog reports it. */
export async function exportBranchFile(
  format: Parameters<Awaited<ReturnType<typeof load>>['exportBranch']>[0],
  project: Project,
  section: 'map' | 'brainstorm',
  id: string,
  preset: Preset,
  projectId?: string,
): Promise<void> {
  await (await load()).exportBranch(format, project, section, id, preset, projectId)
}

/** Print / save as PDF (#106); reports its own failures. */
export async function printProjectFile(
  project: Project,
  preset: Preset,
  view: 'map' | 'brainstorm' | 'outline' | 'split',
): Promise<void> {
  try {
    await (await load()).printProject(project, preset, view)
  } catch (error) {
    showToast(
      t('toast.printFailed', { error: error instanceof Error ? error.message : String(error) }),
      'error',
      9000,
    )
  }
}

/** For callers without their own error handling (the command palette). */
export function reportExport(action: () => Promise<void>): void {
  action().catch((error: unknown) =>
    showToast(
      t('toast.exportFailed', { error: error instanceof Error ? error.message : String(error) }),
      'error',
      9000,
    ),
  )
}
