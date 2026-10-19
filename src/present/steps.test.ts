import { describe, expect, it } from 'vitest'
import { layoutGeometry } from '../map/layout'
import { BUILT_IN_PRESETS } from '../io/seed'
import { makeTree } from '../test/fixtures'
import { viewRootOf } from '../components/focusActions'
import {
  initialPresentState,
  presentationSteps,
  presentKeyAction,
  presentReducer,
  stepAnnouncement,
  stepOf,
  stepView,
  unfoldAll,
  type PresentAction,
  type PresentState,
  type PresentText,
} from './steps'

const ids = (steps: { id: string }[]) => steps.map((step) => step.id)

// Five main branches: the first three go right, the last two left (b is pinned left).
const map = makeTree('r', 'Plan', [
  makeTree('a', 'Launch', [makeTree('a1', 'Pricing'), makeTree('a2', 'Press')]),
  makeTree('b', 'Budget', [], { side: 'left' }),
  makeTree('c', 'Hiring', [makeTree('c1', 'Roles', [makeTree('c11', 'Design')])]),
  makeTree('d', 'Risks'),
  makeTree('e', 'Ops', [makeTree('e1', 'Support')], { collapsed: true }),
])

describe('presentation order (#152, HA-D1)', () => {
  it('goes clockwise: the right side top to bottom, then the left side bottom to top', () => {
    const steps = presentationSteps(map)
    const layout = layoutGeometry(unfoldAll(map), BUILT_IN_PRESETS[0])
    const main = steps.filter((step) => step.parent === 'r').map((step) => step.id)
    const placed = main.map((id) => layout.nodes.find((node) => node.id === id)!)
    const right = placed.filter((node) => node.data.side === 'right')
    const left = placed.filter((node) => node.data.side === 'left')
    expect(placed).toEqual([...right, ...left])
    // Down the right side, then up the left side.
    expect(right.map((node) => node.position.y)).toEqual(
      [...right.map((node) => node.position.y)].sort((x, y) => x - y),
    )
    expect(left.map((node) => node.position.y)).toEqual(
      [...left.map((node) => node.position.y)].sort((x, y) => y - x),
    )
    expect(main).toEqual(['a', 'c', 'e', 'd', 'b'])
  })

  it('reveals each node’s children one step each before going into the first, depth first', () => {
    expect(ids(presentationSteps(map))).toEqual([
      'r',
      'a',
      'c',
      'e',
      'd',
      'b',
      'a1',
      'a2',
      'c1',
      'c11',
      'e1',
    ])
    expect(presentationSteps(map).find((step) => step.id === 'c11')?.parent).toBe('c1')
  })

  it('presents folded branches without unfolding the tree itself', () => {
    expect(ids(presentationSteps(map))).toContain('e1')
    const open = unfoldAll(map)
    expect(open).not.toBe(map)
    expect(open.children![4].collapsed).toBeUndefined()
    expect(map.children![4].collapsed).toBe(true)
    // Branches with nothing folded keep their objects.
    expect(open.children![0]).toBe(map.children![0])
    const plain = makeTree('x', 'X', [makeTree('y', 'Y')])
    expect(unfoldAll(plain)).toBe(plain)
  })

  it('presents only the focused branch, with its children in tree order', () => {
    const branch = viewRootOf(map, 'c')
    expect(ids(presentationSteps(branch))).toEqual(['c', 'c1', 'c11'])
  })

  it('presents a single node as one step', () => {
    const steps = presentationSteps(makeTree('solo', 'Alone'))
    expect(steps).toEqual([{ id: 'solo', parent: null }])
    const view = stepView(steps, 0)
    expect(view.current).toBe('solo')
    expect(view.fit).toEqual(['solo'])
    expect([...view.revealed]).toEqual(['solo'])
  })

  it('shows what was revealed so far, lights the path and fits the group', () => {
    const steps = presentationSteps(map)
    const atC = stepView(
      steps,
      steps.findIndex((step) => step.id === 'c'),
    )
    expect([...atC.revealed]).toEqual(['r', 'a', 'c'])
    expect(atC.group).toBe('r')
    expect(atC.fit).toEqual(['r', 'a', 'c'])
    const atDesign = stepView(steps, stepOf(steps, 'c11'))
    expect(atDesign.fit).toEqual(['c1', 'c11'])
    expect([...atDesign.lit].sort()).toEqual(['c', 'c1', 'c11', 'r'])
    expect(atDesign.revealed.has('e1')).toBe(false)
    expect(stepView(steps, 99).current).toBe('e1')
    expect(stepOf(steps, 'missing')).toBe(0)
  })
})

describe('presentation controls (#152, HA4)', () => {
  const total = 11
  const run = (state: PresentState, ...actions: PresentAction[]) =>
    actions.reduce(presentReducer, state)
  const key = (event: string) => {
    const action = presentKeyAction({ key: event })
    if (!action || action === 'exit') throw new Error(event)
    return { type: 'key', action, total } as const
  }

  it('maps the keys', () => {
    for (const next of ['ArrowRight', 'ArrowDown', ' ', 'PageDown'])
      expect(presentKeyAction({ key: next })).toBe('next')
    for (const back of ['ArrowLeft', 'ArrowUp', 'PageUp'])
      expect(presentKeyAction({ key: back })).toBe('previous')
    expect(presentKeyAction({ key: 'Backspace' })).toBe('erase')
    expect(presentKeyAction({ key: 'Enter' })).toBe('enter')
    expect(presentKeyAction({ key: 'b' })).toBe('blank')
    expect(presentKeyAction({ key: '.' })).toBe('blank')
    expect(presentKeyAction({ key: 'N' })).toBe('notes')
    expect(presentKeyAction({ key: 'Escape' })).toBe('exit')
    expect(presentKeyAction({ key: '7' })).toBe('digit7')
    expect(presentKeyAction({ key: 'k', ctrlKey: true })).toBeNull()
    expect(presentKeyAction({ key: 'x' })).toBeNull()
  })

  it('steps forward and back within the show, and jumps to either end', () => {
    const start = initialPresentState(0, total)
    expect(run(start, key('ArrowLeft')).index).toBe(0)
    expect(run(start, key('ArrowRight'), key(' '), key('Enter')).index).toBe(3)
    expect(run(start, key('ArrowRight'), key('Backspace')).index).toBe(0)
    expect(run(start, key('End')).index).toBe(10)
    expect(run(start, key('End'), key('PageDown')).index).toBe(10)
    expect(run(start, key('End'), key('Home')).index).toBe(0)
    expect(run(start, { type: 'next', total }, { type: 'previous', total }).index).toBe(0)
  })

  it('jumps to a typed step number on Enter; Backspace takes back a digit', () => {
    const start = initialPresentState(0, total)
    const typed = run(start, key('1'), key('2'))
    expect(typed.typed).toBe('12')
    expect(run(typed, key('Backspace')).typed).toBe('1')
    expect(run(typed, key('Backspace'), key('Enter')).index).toBe(0)
    expect(run(start, key('5'), key('Enter')).index).toBe(4)
    // Out of range lands on the last step.
    expect(run(typed, key('Enter')).index).toBe(10)
    expect(run(typed, key('Enter')).typed).toBe('')
  })

  it('blanks the screen and shows captions as toggles; moving shows the screen again', () => {
    const start = initialPresentState(2, total)
    const blank = run(start, key('b'))
    expect(blank.blank).toBe(true)
    expect(run(blank, key('.')).blank).toBe(false)
    expect(run(blank, key('ArrowRight')).blank).toBe(false)
    expect(run(start, key('n')).captions).toBe(true)
    expect(run(start, key('n'), key('N')).captions).toBe(false)
  })

  it('shows the progress again on input and hides it when told', () => {
    const start = initialPresentState(0, total)
    const hidden = run(start, { type: 'hideHud' })
    expect(hidden.hud).toBe(false)
    const woken = run(hidden, { type: 'wake' })
    expect(woken.hud).toBe(true)
    expect(woken.inputs).toBe(1)
  })

  it('keeps the step inside a show that got shorter', () => {
    const late = initialPresentState(10, total)
    expect(run(late, { type: 'next', total: 4 }).index).toBe(3)
  })
})

describe('step announcement (#152, HA7)', () => {
  const text: PresentText = (key, params = {}) =>
    `${key}(${Object.entries(params)
      .map(([name, value]) => `${name}=${value}`)
      .join(',')})`

  it('names the step, the node and its parent, and the notes with captions on', () => {
    expect(stepAnnouncement(text, 0, 48, 'Plan', null, null)).toBe('step(n=1,total=48,title=Plan)')
    expect(stepAnnouncement(text, 11, 48, 'Pricing', 'Launch', 'Tiers')).toBe(
      'stepUnder(n=12,total=48,title=Pricing,parent=Launch) notesSpoken(notes=Tiers)',
    )
  })
})
