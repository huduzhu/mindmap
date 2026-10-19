import {
  appendBrainstormToMap,
  countBullets,
  replaceMapWithBrainstorm,
} from '../map/fromBrainstorm'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { askChoice } from './choiceStore'
import { showToast } from './toastStore'
import { t, tn } from '../i18n'
import '../i18n/en/outliner'

/**
 * "Copy brainstorm to map" (#87): asks whether to add the bullets under the
 * map's root or to replace the map's branches, then does it as one undo step
 * and shows the map.
 */
export async function copyBrainstormToMap(): Promise<boolean> {
  const project = useProjects.getState().current
  if (!project) return false
  const bullets = countBullets(project.brainstorm)
  if (bullets === 0) {
    showToast(t('toMap.empty'), 'error')
    return false
  }
  const mapBranches = project.map.children?.length ?? 0
  const choice = await askChoice<'append' | 'replace'>({
    title: t('toMap.title'),
    message: tn('toMap.message', bullets),
    choices: [
      {
        value: 'append',
        label: t('toMap.append'),
        detail: mapBranches > 0 ? tn('toMap.keep', mapBranches) : t('toMap.noBranches'),
        tone: 'primary',
      },
      {
        value: 'replace',
        label: t('toMap.replace'),
        detail: mapBranches > 0 ? tn('toMap.remove', mapBranches) : t('toMap.sameAsAdd'),
        tone: 'danger',
      },
    ],
  })
  if (!choice) return false
  const brainstorm = useProjects.getState().current?.brainstorm ?? project.brainstorm
  const editor = useEditor.getState()
  editor.applyTree('map', (map) =>
    choice === 'replace'
      ? replaceMapWithBrainstorm(map, brainstorm)
      : appendBrainstormToMap(map, brainstorm),
  )
  editor.setView('map')
  showToast(tn(choice === 'replace' ? 'toMap.replaced' : 'toMap.copied', bullets))
  return true
}
