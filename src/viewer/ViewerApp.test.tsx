import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import defaultPreset from '../../presets/default.json'
import type { Preset, Project } from '../schema/types'
import { makeProject, makeTree } from '../test/fixtures'
import { ViewerApp, type ViewerData } from './ViewerApp'

// React Flow asks for prefers-color-scheme; jsdom does not ship matchMedia.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

const asset = `sha256-${'a'.repeat(64)}`

function viewerData(locale = 'en'): ViewerData {
  const map = makeTree('m', 'Kitchen', [
    makeTree('a', 'Bench', [], { notes: 'Stone top' }),
    makeTree('b', 'Doors', [], { image: { asset, w: 100, h: 50 } }),
  ])
  const project: Project = makeProject('Kitchen', undefined, map)
  return {
    project,
    preset: defaultPreset as unknown as Preset,
    locale,
    images: { [asset]: 'data:image/png;base64,AAAA' },
  }
}

async function nodeTitled(title: string): Promise<HTMLElement> {
  const label = await screen.findByText(title, { selector: '.map-node-title' })
  return label.closest('.react-flow__node') as HTMLElement
}

describe('the HTML export viewer', () => {
  it('marks nodes that have notes, as the app does, in both languages', async () => {
    const { unmount } = render(<ViewerApp data={viewerData()} />)
    const bench = await nodeTitled('Bench')
    const marker = bench.querySelector('.map-node-notes')
    expect(marker).not.toBeNull()
    expect(marker).toHaveAttribute('aria-hidden', 'true')
    expect(bench).toHaveTextContent('Has notes')
    expect((await nodeTitled('Doors')).querySelector('.map-node-notes')).toBeNull()
    unmount()

    render(<ViewerApp data={viewerData('zh-CN')} />)
    expect(await nodeTitled('Bench')).toHaveTextContent('有备注')
  })

  it('closes the notes card with Escape', async () => {
    render(<ViewerApp data={viewerData()} />)
    fireEvent.click(await nodeTitled('Bench'))
    expect(await screen.findByRole('dialog', { name: 'Node notes' })).toHaveTextContent('Stone top')
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Node notes' })).not.toBeInTheDocument(),
    )
  })

  it('closes only the enlarged picture with Escape when one is open', async () => {
    render(<ViewerApp data={viewerData()} />)
    fireEvent.click(await nodeTitled('Bench'))
    await screen.findByRole('dialog', { name: 'Node notes' })
    const doors = await nodeTitled('Doors')
    fireEvent.click(doors.querySelector('.node-thumb-open')!)
    expect(await screen.findByTestId('viewer-image-view')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    await waitFor(() => expect(screen.queryByTestId('viewer-image-view')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Node notes' })).toBeInTheDocument()
  })

  it('closes the enlarged picture when F5 starts the presentation', async () => {
    render(<ViewerApp data={viewerData()} />)
    fireEvent.click((await nodeTitled('Doors')).querySelector('.node-thumb-open')!)
    expect(await screen.findByTestId('viewer-image-view')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(document, { key: 'F5' })
    })
    await waitFor(() => expect(screen.queryByTestId('viewer-image-view')).not.toBeInTheDocument())
  })
})
