import { describe, expect, it } from 'vitest'
import { BUILT_IN_PRESETS } from '../io/seed'
import type { Role } from '../schema/constants'
import { resolveNodeStyle } from './nodeStyle'

/** Every role choice must change how a node looks (live test, item 1). */
describe('role styles in the built-in presets', () => {
  const choices: (Role | undefined)[] = [
    undefined,
    'main-branch',
    'branch',
    'leaf',
    'task',
    'idea',
    'question',
    'risk',
  ]

  for (const preset of BUILT_IN_PRESETS) {
    it(`"${preset.name}" draws every role differently`, () => {
      const looks = choices.map((role) =>
        JSON.stringify(resolveNodeStyle(preset, { id: 'n', title: 'Node', role }, false)),
      )
      expect(new Set(looks).size).toBe(choices.length)
    })
  }
})
