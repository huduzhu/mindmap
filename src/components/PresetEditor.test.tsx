import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getPreset } from '../io/db'
import { BUILT_IN_PRESETS } from '../io/seed'
import { useProjects } from '../store/projects'
import { resetDatabase } from '../test/resetDb'
import { PresetEditor } from './PresetEditor'
import { presetNameProblem, suggestName } from './presetNames'

const base = BUILT_IN_PRESETS.find((preset) => preset.name === 'default')!

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  await resetDatabase()
  await useProjects.getState().createProject('Styled')
})

describe('preset names (#104)', () => {
  it('suggests a free, valid name', () => {
    expect(suggestName('Ocean Blue!', new Set())).toBe('ocean-blue')
    expect(suggestName('ocean', new Set(['ocean', 'ocean-2']))).toBe('ocean-3')
    expect(suggestName('!!!', new Set())).toBe('my-preset')
  })

  it('refuses invalid names and built-in ones', () => {
    expect(presetNameProblem('my-theme')).toBeNull()
    expect(presetNameProblem('My Theme')).toBe('editor.nameInvalid')
    expect(presetNameProblem('default')).toBe('editor.nameBuiltIn')
  })
})

describe('PresetEditor (#104)', () => {
  it('customizes a copy of a built-in preset, saves it and uses it', async () => {
    let done = false
    render(
      <PresetEditor initial={base} taken={new Set(['default'])} onDone={() => (done = true)} />,
    )
    const name = screen.getByTestId('preset-editor-name') as HTMLInputElement
    expect(name.value).toBe('default-custom')

    fireEvent.change(screen.getByTestId('preset-colour-background'), {
      target: { value: '#102030' },
    })
    fireEvent.change(screen.getByTestId('preset-editor-size'), { target: { value: '18' } })
    // backgroundColor, not the background shorthand: jsdom 30.1 reports the whole
    // expanded shorthand for `background`.
    expect(screen.getByTestId('preset-preview')).toHaveStyle({ backgroundColor: '#102030' })

    fireEvent.click(screen.getByTestId('preset-editor-save-use'))
    await waitFor(() => expect(done).toBe(true))
    const stored = await getPreset('default-custom')
    expect(stored?.palette.background).toBe('#102030')
    expect(stored?.font.baseSize).toBe(18)
    // Role styles come from the preset it started from.
    expect(stored?.roles).toEqual(base.roles)
    expect(useProjects.getState().current!.preset).toBe('default-custom')
  })

  it('cannot save under a built-in or invalid name', () => {
    render(<PresetEditor initial={base} taken={new Set()} onDone={() => undefined} />)
    const name = screen.getByTestId('preset-editor-name')
    fireEvent.change(name, { target: { value: 'dark' } })
    expect(screen.getByRole('alert')).toHaveTextContent('built-in')
    expect(screen.getByTestId('preset-editor-save')).toBeDisabled()
    fireEvent.change(name, { target: { value: 'Bad_Name' } })
    expect(screen.getByTestId('preset-editor-save')).toBeDisabled()
  })

  it('keeps what is typed in the name field and trims it only when saving', async () => {
    let done = false
    render(<PresetEditor initial={base} taken={new Set()} onDone={() => (done = true)} />)
    const name = screen.getByTestId('preset-editor-name') as HTMLInputElement
    fireEvent.change(name, { target: { value: ' my-theme ' } })
    expect(name.value).toBe(' my-theme ')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByTestId('preset-editor-save'))
    await waitFor(() => expect(done).toBe(true))
    expect((await getPreset('my-theme'))?.name).toBe('my-theme')
  })

  it('offers to replace another custom preset with the same name', () => {
    render(
      <PresetEditor
        initial={{ ...base, name: 'mine' }}
        taken={new Set(['mine', 'other'])}
        onDone={() => undefined}
      />,
    )
    expect(screen.getByTestId('preset-editor-save')).toHaveTextContent('Save')
    fireEvent.change(screen.getByTestId('preset-editor-name'), { target: { value: 'other' } })
    expect(screen.getByTestId('preset-editor-save')).toHaveTextContent('Replace')
  })

  it('warns about text that is hard to read on its background (#138)', () => {
    render(<PresetEditor initial={base} taken={new Set()} onDone={() => undefined} />)
    expect(screen.queryByTestId('preset-contrast-warning')).toBeNull()
    fireEvent.change(screen.getByTestId('preset-colour-mutedText'), {
      target: { value: '#bbbbbb' },
    })
    const warning = screen.getByTestId('preset-contrast-warning')
    expect(warning).toHaveTextContent('Quiet text on Background')
    expect(warning).toHaveTextContent('Quiet text on Node fill')
    expect(warning).toHaveTextContent('4.5:1')
    // A warning only: saving still works.
    expect(screen.getByTestId('preset-editor-save')).not.toBeDisabled()
  })
})
