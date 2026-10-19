import { beforeEach, describe, expect, it } from 'vitest'
import { useUi } from './ui'

describe('ui store (#66)', () => {
  beforeEach(() => useUi.getState().closeAll())

  it('resetTransient clears the toolbar dialogs but keeps the palette open', () => {
    const ui = useUi.getState()
    ui.setPaletteOpen(true)
    ui.setPresetsOpen(true)
    ui.setAiDialogOpen(true)
    ui.setRenamingProject(true)
    ui.setDeleteOpen(true)
    useUi.getState().resetTransient()
    expect(useUi.getState()).toMatchObject({
      paletteOpen: true,
      presetsOpen: false,
      aiDialogOpen: false,
      renamingProject: false,
      deleteOpen: false,
    })
  })

  it('closeAll closes everything, including the palette', () => {
    useUi.getState().setPaletteOpen(true)
    useUi.getState().setDeleteOpen(true)
    useUi.getState().closeAll()
    expect(useUi.getState().paletteOpen).toBe(false)
    expect(useUi.getState().deleteOpen).toBe(false)
  })
})
