import { announceImport, showToast } from './toastStore'
import { t } from '../i18n'
import { lazyImport } from '../pwa/update'

/**
 * "Try the guide" (#78, decision H-D1): a bilingual English/Chinese map that
 * teaches the shortcuts. Always imported as a new project, so it can be
 * edited freely and fetched again.
 */
export async function openGuide(): Promise<void> {
  try {
    // The guide and the importer load on demand (#88).
    const [{ default: guide }, { importJsonText }] = await Promise.all([
      lazyImport(() => import('../../examples/getting-started.json')),
      lazyImport(() => import('../io/import')),
    ])
    announceImport(await importJsonText(JSON.stringify(guide)))
  } catch (error) {
    showToast(
      t('guide.failed', { error: error instanceof Error ? error.message : String(error) }),
      'error',
    )
  }
}
