import { useEffect, useMemo, useState } from 'react'
import { announce } from '../a11y/announcer'
import { useResolvedPreset } from '../hooks/usePreset'
import { useT } from '../i18n'
import { PresentStage } from '../present/PresentStage'
import type { PresentText } from '../present/steps'
import { focusSection, useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { useUi } from '../store/ui'
import { activeFocusView, viewRootOf } from './focusActions'
import { releaseKeys } from './presentActions'
import '../i18n/en/present'
import { NodeThumb } from './NodeThumb'
import type { NodeImage } from '../schema/types'

const renderImage = (image: NodeImage) => <NodeThumb image={image} className="map-node-image" />

/**
 * Presentation mode in the app (#152), a lazy chunk. It reads the project
 * and the editor but never writes to them: the stage keeps its own state, so
 * leaving puts nothing back because nothing was changed (HA5).
 */
export function PresentOverlay({ onClose }: { onClose: () => void }) {
  const t = useT()
  const project = useProjects((s) => s.current)
  const from = useUi((s) => s.presenting?.from ?? null)
  const preset = useResolvedPreset(project?.preset ?? 'default')
  // In focus mode only the focused branch is presented (HA1), as it was when the show began.
  const [focusId] = useState(() => {
    const { focus } = useEditor.getState()
    const view = activeFocusView()
    return focusSection(view) === 'map' ? focus[view] : focus.map
  })
  const root = useMemo(
    () => (project ? viewRootOf(project.map, focusId) : null),
    [project, focusId],
  )
  // The stage has its keys now (its effects ran first).
  useEffect(() => releaseKeys(), [])
  const text: PresentText = (key, params) => t(`present.${key}`, params)
  if (!project || !root) return null
  return (
    <PresentStage
      root={root}
      preset={preset}
      links={project.links}
      startId={from}
      text={text}
      announce={announce}
      renderImage={renderImage}
      onExit={onClose}
    />
  )
}
