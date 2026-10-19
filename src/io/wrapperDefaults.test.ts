// @vitest-environment node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA_VERSION } from '../schema/constants'
import {
  addedWrapperFields,
  fillWrapperDefaults,
  SCHEMA_VERSION as SCRIPT_SCHEMA_VERSION,
  WRAPPER_KINDS,
} from '../../scripts/wrapper-defaults.mjs'
import { repairDocument, run } from '../../scripts/repair-llm-output.mjs'
import { validateDoc as scriptValidateDoc } from '../../scripts/validate.mjs'
import projectSchema from '../../schemas/project.schema.json'

const brainstorm = { id: 'b', title: 'Sprint retro', children: [] }

const update = (extra: Record<string, unknown> = {}) => ({
  kind: 'brainstorm-update',
  sourceProjectId: 'p-1',
  brainstorm,
  ...extra,
})

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mms-repair-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('wrapper defaults — parity', () => {
  // scripts/ has no build step, so the constant is duplicated rather than
  // imported. This is the guard that keeps the copy honest (same idiom as the
  // two-validator parity guard in src/schema/parity.test.ts).
  it('the script copy of SCHEMA_VERSION matches src/schema/constants.ts', () => {
    expect(SCRIPT_SCHEMA_VERSION).toBe(SCHEMA_VERSION)
  })

  it('...and matches the const the schemas themselves pin', () => {
    expect(projectSchema.properties.schemaVersion.const).toBe(SCHEMA_VERSION)
  })

  it('covers exactly the kinds the importer fills', () => {
    expect([...WRAPPER_KINDS].sort()).toEqual(['brainstorm-update', 'project', 'template'])
  })
})

describe('fillWrapperDefaults', () => {
  it('fills schemaVersion, name, and preset when they are absent', () => {
    const filled = fillWrapperDefaults(update()) as Record<string, unknown>
    expect(filled.schemaVersion).toBe(SCHEMA_VERSION)
    expect(filled.name).toBe('Sprint retro')
    expect(filled.preset).toBe('default')
  })

  it('never overwrites values the document already carries', () => {
    const filled = fillWrapperDefaults(
      update({ schemaVersion: 1, name: 'Mine', preset: 'dark' }),
    ) as Record<string, unknown>
    expect(filled.name).toBe('Mine')
    expect(filled.preset).toBe('dark')
  })

  it('derives the name from the brainstorm title, then the root title, then "Untitled"', () => {
    const fromBrainstorm = fillWrapperDefaults(update()) as Record<string, unknown>
    expect(fromBrainstorm.name).toBe('Sprint retro')

    const fromRoot = fillWrapperDefaults({
      kind: 'project',
      root: { title: 'Root title' },
      brainstorm: { id: 'b' },
    }) as Record<string, unknown>
    expect(fromRoot.name).toBe('Root title')

    const fromNothing = fillWrapperDefaults({ kind: 'project' }) as Record<string, unknown>
    expect(fromNothing.name).toBe('Untitled')
  })

  it('leaves kinds without a wrapper untouched, by identity', () => {
    for (const kind of ['preset', 'analysis-request']) {
      const doc = { kind }
      expect(fillWrapperDefaults(doc)).toBe(doc)
    }
  })

  it('leaves non-objects untouched', () => {
    for (const value of [null, undefined, 42, 'text', [1, 2]]) {
      expect(fillWrapperDefaults(value)).toBe(value)
    }
  })

  it('does not invent a kind', () => {
    const filled = fillWrapperDefaults({ brainstorm }) as Record<string, unknown>
    expect(filled.schemaVersion).toBeUndefined()
  })
})

describe('addedWrapperFields', () => {
  it('reports exactly the keys the fill introduced', () => {
    const before = update()
    expect(addedWrapperFields(before, fillWrapperDefaults(before))).toEqual([
      'schemaVersion',
      'name',
      'preset',
    ])
  })

  it('reports nothing when the wrapper is already complete', () => {
    const before = update({ schemaVersion: 1, name: 'Done', preset: 'default' })
    expect(addedWrapperFields(before, fillWrapperDefaults(before))).toEqual([])
  })

  it('is safe on non-objects', () => {
    expect(addedWrapperFields(null, { a: 1 })).toEqual([])
    expect(addedWrapperFields({ a: 1 }, 'nope')).toEqual([])
  })
})

describe('repairDocument', () => {
  it('fills and validates in the default mode', () => {
    const result = repairDocument(update())
    expect(result.missing).toEqual(['schemaVersion', 'name', 'preset'])
    expect(result.ok).toBe(true)
    expect(result.validation.errors).toHaveLength(0)
  })

  it('--strict fills nothing and validates the document as handed over', () => {
    const doc = update()
    const result = repairDocument(doc, { strict: true })
    expect(result.doc).toBe(doc)
    expect(result.missing).toEqual(['schemaVersion', 'name', 'preset'])
    expect(result.ok).toBe(false)
  })

  it('reports errors filling cannot fix', () => {
    const result = repairDocument(
      update({ brainstorm: { id: 'b', title: 'X', role: 'not-a-role', children: [] } }),
    )
    expect(result.ok).toBe(false)
    expect(result.validation.errors.length).toBeGreaterThan(0)
  })

  it('leaves an already-valid document valid', () => {
    const result = repairDocument(update({ schemaVersion: 1, name: 'Done', preset: 'default' }))
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  // This is the whole reason the CLI exists. The skill's mandatory gate
  // (`scripts/validate.mjs`) does not fill wrapper defaults, while the app's
  // importer does (#30) — so a wrapper-less document FAILs the gate that the app
  // would have accepted. Without repair, the skill is stuck between a validator
  // that rejects the file and an app that would take it, which is exactly how a
  // run ends up handed over as a confusing failure.
  it('reconciles the strict validator with the lenient importer', () => {
    const doc = update()
    expect(scriptValidateDoc(doc).ok).toBe(false)
    expect(repairDocument(doc).ok).toBe(true)
  })

  it('...and refuses to paper over anything the importer would not accept either', () => {
    const doc = update({ brainstorm: { id: 'b', title: 'X', role: 'not-a-role', children: [] } })
    expect(scriptValidateDoc(doc).ok).toBe(false)
    expect(repairDocument(doc).ok).toBe(false)
  })
})

describe('repair CLI', () => {
  const write = (name: string, doc: unknown) => {
    const file = path.join(dir, name)
    writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8')
    return file
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('writes a sibling .repaired.json and exits 0', () => {
    const file = write('missing.json', update())
    expect(run([file])).toBe(0)

    const out = `${file}.repaired.json`
    expect(existsSync(out)).toBe(true)
    const repaired = JSON.parse(readFileSync(out, 'utf8'))
    expect(repaired.schemaVersion).toBe(SCHEMA_VERSION)
    expect(repaired.name).toBe('Sprint retro')
    expect(repaired.preset).toBe('default')
    // The original is never mutated — that is the point of the sibling default.
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBeUndefined()
  })

  it('--in-place overwrites the input instead', () => {
    const file = write('inplace.json', update())
    expect(run([file, '--in-place'])).toBe(0)
    expect(existsSync(`${file}.repaired.json`)).toBe(false)
    expect(JSON.parse(readFileSync(file, 'utf8')).name).toBe('Sprint retro')
    // The original is kept as a backup (#70).
    expect(JSON.parse(readFileSync(`${file}.bak`, 'utf8')).name).toBeUndefined()
  })

  it('exits 3 with a message instead of a stack trace when the output cannot be written (#70)', () => {
    const file = write('unwritable.json', update())
    // A directory where the sibling output file should go makes the rename fail.
    mkdirSync(`${file}.repaired.json`)
    expect(run([file])).toBe(3)
  })

  it('writes nothing when there is nothing to repair', () => {
    const file = write(
      'complete.json',
      update({ schemaVersion: 1, name: 'Done', preset: 'default' }),
    )
    expect(run([file])).toBe(0)
    expect(existsSync(`${file}.repaired.json`)).toBe(false)
  })

  it('--strict writes nothing and exits 1', () => {
    const file = write('strict.json', update())
    expect(run([file, '--strict'])).toBe(1)
    expect(existsSync(`${file}.repaired.json`)).toBe(false)
  })

  it('exits 1 when errors survive the repair', () => {
    const file = write(
      'bad.json',
      update({ brainstorm: { id: 'b', title: 'X', role: 'nope', children: [] } }),
    )
    expect(run([file])).toBe(1)
    expect(existsSync(`${file}.repaired.json`)).toBe(false)
  })

  it('exits 2 on unreadable input, bad JSON, and bad usage', () => {
    expect(run([path.join(dir, 'nope.json')])).toBe(2)
    const broken = path.join(dir, 'broken.json')
    writeFileSync(broken, '{ not json', 'utf8')
    expect(run([broken])).toBe(2)
    expect(run([])).toBe(2)
    expect(run(['a.json', 'b.json'])).toBe(2)
    expect(run([path.join(dir, 'x.json'), '--bogus'])).toBe(2)
  })
})
