import { StrictMode, type RefObject } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RenameInput } from './RenameInput'

// The app mounts under <StrictMode> (src/main.tsx), so in dev React runs every
// effect as mount → cleanup → mount — and it detaches refs *before* running those
// cleanups. RenameInput's focus-return cleanup used to fire during the simulated
// unmount, blur the input it had just focused, and commit an empty rename. The
// inline editor closed the instant it opened, so F2/Enter/Tab could never rename a
// node on the Mind Map canvas or in the Brainstorm outliner — while the Outline
// (which passes no returnFocusRef) kept working.
//
// Nothing in the suite rendered under StrictMode, so 400 tests passed while dev was
// broken. These tests exist to keep that gap closed.

const appended: HTMLElement[] = []

function makeOwner(tag = 'button'): RefObject<HTMLElement | null> {
  const el = document.createElement(tag)
  document.body.appendChild(el)
  appended.push(el)
  return { current: el }
}

afterEach(() => {
  while (appended.length) appended.pop()?.remove()
})

describe('RenameInput — focus ownership', () => {
  it('StrictMode remount keeps focus on the input and does not commit', () => {
    const onCommit = vi.fn()

    render(
      <StrictMode>
        <RenameInput initial="Idea" onCommit={onCommit} returnFocusRef={makeOwner()} />
      </StrictMode>,
    )

    expect(document.activeElement).toBe(screen.getByDisplayValue('Idea'))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('returns focus to the owner when the input unmounts while still focused', () => {
    const owner = makeOwner()
    const { unmount } = render(
      <RenameInput initial="Idea" onCommit={() => {}} returnFocusRef={owner} />,
    )

    expect(document.activeElement).toBe(screen.getByDisplayValue('Idea'))
    unmount()
    expect(document.activeElement).toBe(owner.current)
  })

  it('leaves focus alone when it already moved somewhere else', () => {
    const owner = makeOwner()
    const other = makeOwner()

    const { unmount } = render(
      <RenameInput initial="Idea" onCommit={() => {}} returnFocusRef={owner} />,
    )
    other.current?.focus()
    unmount()

    expect(document.activeElement).toBe(other.current)
  })
})

describe('RenameInput — Tab while typing (#132)', () => {
  it('saves the text, reports the direction and stays open', () => {
    const onCommit = vi.fn()
    const onTab = vi.fn()
    render(<RenameInput initial="Idea" onCommit={onCommit} onTab={onTab} />)
    const input = screen.getByDisplayValue('Idea')
    fireEvent.change(input, { target: { value: 'Better idea' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(onCommit).toHaveBeenCalledWith('Better idea')
    expect(onTab).toHaveBeenCalledWith(false)
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })
    expect(onTab).toHaveBeenLastCalledWith(true)
    expect(document.activeElement).toBe(input)
  })

  it('does not save a blank draft but still moves the row', () => {
    const onCommit = vi.fn()
    const onTab = vi.fn()
    render(<RenameInput initial="Idea" onCommit={onCommit} onTab={onTab} />)
    const input = screen.getByDisplayValue('Idea')
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(onTab).toHaveBeenCalledWith(false)
  })

  it('a blur during the move does not end the rename', () => {
    const onCommit = vi.fn()
    render(<RenameInput initial="Idea" onCommit={onCommit} onTab={() => {}} />)
    const input = screen.getByDisplayValue('Idea')
    fireEvent.keyDown(input, { key: 'Tab' })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
