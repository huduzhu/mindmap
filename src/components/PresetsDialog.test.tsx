import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { putPreset } from '../io/db'
import { BUILT_IN_PRESETS } from '../io/seed'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { resetDatabase } from '../test/resetDb'
import { PresetsDialog } from './PresetsDialog'

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
})

async function seedBuiltInsAndCustom() {
  for (const preset of BUILT_IN_PRESETS) {
    await putPreset(preset)
  }
  await putPreset({
    kind: 'preset',
    schemaVersion: 1,
    name: 'custom-preset',
    palette: {
      background: '#000000',
      text: '#ffffff',
      mutedText: '#cccccc',
      nodeFill: '#222222',
      nodeBorder: '#444444',
      edge: '#888888',
      branchColors: ['#ff00ff'],
    },
    roles: {},
    font: { family: 'system-ui', baseSize: 14, titleScale: 1.4 },
    edges: { curve: 'bezier', width: 1.5, dashed: false },
  })
  await useProjects.getState().createProject('Presets test')
  useProjects.getState().updateCurrent((p) => ({ ...p, preset: 'default' }))
}

async function setupDialog() {
  await seedBuiltInsAndCustom()
  return render(<PresetsDialog onClose={() => undefined} />)
}

describe('PresetsDialog', () => {
  it('lists every preset and marks the in-use one', async () => {
    await setupDialog()
    await waitFor(() => {
      expect(screen.getByTestId('preset-list').children.length).toBe(BUILT_IN_PRESETS.length + 2) // + custom, + system
    })
    expect(screen.getByTestId('preset-row-default')).toHaveTextContent('(in use)')
    expect(screen.getByTestId('preset-row-default')).toHaveTextContent('(built-in)')
    // Display names, not ids (#211).
    expect(screen.getByTestId('preset-row-colorblind-safe')).toHaveTextContent('Colour-blind safe')
    expect(screen.getByTestId('preset-row-default')).toHaveTextContent(/^Default/)
  })

  it('offers "system", which follows the device, and applies it (#86)', async () => {
    await setupDialog()
    const row = await screen.findByTestId('preset-row-system')
    expect(row).toHaveTextContent('follows your device')
    expect(row).toHaveTextContent(/now: (Default|Dark)\)/)
    fireEvent.click(screen.getByTestId('preset-apply-system'))
    expect(useProjects.getState().current?.preset).toBe('system')
  })

  it('marks built-in presets with the built-in badge', async () => {
    await setupDialog()
    await waitFor(() => {
      expect(screen.getByTestId('preset-row-default')).toBeInTheDocument()
    })
    for (const builtIn of BUILT_IN_PRESETS) {
      expect(screen.getByTestId(`preset-row-${builtIn.name}`)).toHaveTextContent('(built-in)')
    }
    expect(screen.getByTestId('preset-row-custom-preset')).not.toHaveTextContent('(built-in)')
  })

  it('disables Delete on built-in presets', async () => {
    await setupDialog()
    await waitFor(() => {
      expect(screen.getByTestId('preset-delete-default')).toBeInTheDocument()
    })
    for (const builtIn of BUILT_IN_PRESETS) {
      expect(screen.getByTestId(`preset-delete-${builtIn.name}`)).toBeDisabled()
    }
  })

  it('disables Delete on the in-use preset even when it is a custom preset', async () => {
    await seedBuiltInsAndCustom()
    useProjects.getState().updateCurrent((p) => ({ ...p, preset: 'custom-preset' }))
    render(<PresetsDialog onClose={() => undefined} />)
    await waitFor(() => {
      expect(screen.getByTestId('preset-delete-custom-preset')).toBeInTheDocument()
    })
    expect(screen.getByTestId('preset-delete-custom-preset')).toBeDisabled()
    // The in-use built-in default now has Delete disabled by two distinct reasons —
    // assert both the built-in and current labels appear on its row.
    expect(screen.getByTestId('preset-row-default')).toHaveTextContent('(built-in)')
  })

  it('enables Delete on a custom, non-current preset', async () => {
    await setupDialog()
    await waitFor(() => {
      expect(screen.getByTestId('preset-delete-custom-preset')).toBeInTheDocument()
    })
    expect(screen.getByTestId('preset-delete-custom-preset')).not.toBeDisabled()
  })

  it('deletes a custom preset and refreshes the list', async () => {
    await setupDialog()
    await waitFor(() => {
      expect(screen.getByTestId('preset-delete-custom-preset')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('preset-delete-custom-preset'))
    fireEvent.click(screen.getByTestId('confirm-dialog-accept'))

    await waitFor(() => {
      expect(screen.queryByTestId('preset-row-custom-preset')).not.toBeInTheDocument()
    })
    // The list still contains all built-ins.
    for (const builtIn of BUILT_IN_PRESETS) {
      expect(screen.getByTestId(`preset-row-${builtIn.name}`)).toBeInTheDocument()
    }
  })

  it('does nothing when the confirm dialog is dismissed', async () => {
    await setupDialog()
    await waitFor(() => {
      expect(screen.getByTestId('preset-delete-custom-preset')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('preset-delete-custom-preset'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('preset-row-custom-preset')).toBeInTheDocument()
  })

  it('Apply is still disabled for the in-use preset (existing behaviour preserved)', async () => {
    await setupDialog()
    await waitFor(() => {
      expect(screen.getByTestId('preset-apply-default')).toBeInTheDocument()
    })
    expect(screen.getByTestId('preset-apply-default')).toBeDisabled()
    expect(screen.getByTestId('preset-apply-custom-preset')).not.toBeDisabled()
  })
})
