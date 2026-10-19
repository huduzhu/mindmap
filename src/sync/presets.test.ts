import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import * as db from '../io/db'
import { BUILT_IN_PRESETS } from '../io/seed'
import type { Preset } from '../schema/types'
import { FakeDirectory } from '../test/fakeDirectory'
import { makeProject } from '../test/fixtures'
import { resetDatabase } from '../test/resetDb'
import { wrapHandle } from './folder'
import { syncPresets } from './presets'

let dir: FakeDirectory
const folder = () => wrapHandle(dir, [0, 0])
const sub = () => dir.dirs.get('_presets')!

function preset(name: string, background = '#ffffff'): Preset {
  const base = structuredClone(BUILT_IN_PRESETS[0])
  return { ...base, name, palette: { ...base.palette, background } }
}
const text = (p: Preset) => `${JSON.stringify(p, null, 2)}\n`

beforeEach(async () => {
  await resetDatabase()
  dir = new FakeDirectory('MindMaps')
})

describe('preset sync (#115)', () => {
  it('writes custom presets once, never the built-in ones', async () => {
    for (const p of BUILT_IN_PRESETS) await db.putPreset(p)
    await db.putPreset(preset('ocean'))
    expect((await syncPresets(folder())).written).toBe(1)
    expect([...sub().files.keys()]).toEqual(['ocean.json'])
    expect((await syncPresets(folder())).written).toBe(0)
  })

  it('takes an edit made on another PC, and writes one made here', async () => {
    await db.putPreset(preset('ocean'))
    await syncPresets(folder())
    sub().put('ocean.json', text(preset('ocean', '#000000')))
    expect((await syncPresets(folder())).taken).toBe(1)
    expect((await db.getPreset('ocean'))!.palette.background).toBe('#000000')

    await db.putPreset(preset('ocean', '#123456'))
    expect((await syncPresets(folder())).written).toBe(1)
    expect((sub().json('ocean.json') as Preset).palette.background).toBe('#123456')
  })

  it('adds a preset made on another PC', async () => {
    await syncPresets(folder())
    sub().put('forest.json', text(preset('forest')))
    expect((await syncPresets(folder())).taken).toBe(1)
    expect(await db.getPreset('forest')).toBeDefined()
  })

  it('a preset deleted here moves to _trash; one deleted elsewhere goes here too', async () => {
    await db.putPreset(preset('ocean'))
    await db.putPreset(preset('forest'))
    await syncPresets(folder())

    await db.deletePreset('ocean')
    expect((await syncPresets(folder())).removedInFolder).toBe(1)
    expect(sub().files.has('ocean.json')).toBe(false)
    expect(dir.dirs.get('_presets')!.dirs.get('_trash')!.files.has('ocean.json')).toBe(true)

    sub().files.delete('forest.json')
    expect((await syncPresets(folder())).removedHere).toBe(1)
    expect(await db.getPreset('forest')).toBeUndefined()
  })

  it('keeps a preset deleted elsewhere while a project here still uses it', async () => {
    await db.putPreset(preset('ocean'))
    await db.putProject({
      id: 'AAAAAAAAAA',
      project: { ...makeProject('Uses ocean'), preset: 'ocean' },
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
    await syncPresets(folder())
    sub().files.delete('ocean.json')
    expect((await syncPresets(folder())).written).toBe(1)
    expect(await db.getPreset('ocean')).toBeDefined()
    expect(sub().files.has('ocean.json')).toBe(true)
  })

  it('changed on both sides: this PC’s version stays, the other becomes a copy', async () => {
    await db.putPreset(preset('ocean'))
    await syncPresets(folder())
    await db.putPreset(preset('ocean', '#111111'))
    sub().put('ocean.json', text(preset('ocean', '#222222')))
    const report = await syncPresets(folder())
    expect(report.conflicts).toEqual(['ocean'])
    expect((await db.getPreset('ocean'))!.palette.background).toBe('#111111')
    expect((await db.getPreset('ocean-conflict'))!.palette.background).toBe('#222222')
    expect((sub().json('ocean.json') as Preset).palette.background).toBe('#111111')
    expect(sub().files.has('ocean-conflict.json')).toBe(true)
    expect(await syncPresets(folder())).toMatchObject({ written: 0, taken: 0, conflicts: [] })
  })
})

describe('preset sync guards (#123)', () => {
  it('a folder that turns up empty does not delete presets here', async () => {
    await db.putPreset(preset('ocean'))
    await db.putPreset(preset('forest'))
    await syncPresets(folder())
    sub().files.clear()
    expect((await syncPresets(folder())).removedHere).toBe(0)
    expect(await db.getPreset('ocean')).toBeDefined()
    expect(await db.getPreset('forest')).toBeDefined()
  })

  it('a preset file OneDrive is busy with is left alone', async () => {
    await db.putPreset(preset('ocean'))
    await syncPresets(folder())
    sub().statFails.add('ocean.json')
    const report = await syncPresets(folder())
    expect(report).toMatchObject({ removedHere: 0, written: 0 })
    expect(await db.getPreset('ocean')).toBeDefined()
  })

  it('deletes nothing here while project deletions are paused', async () => {
    await db.putPreset(preset('ocean'))
    await syncPresets(folder())
    sub().files.delete('ocean.json')
    expect((await syncPresets(folder(), { allowDeletes: false })).removedHere).toBe(0)
    expect(await db.getPreset('ocean')).toBeDefined()
  })

  it('treats __proto__.json and constructor.json as ordinary file names', async () => {
    await syncPresets(folder())
    sub().put('__proto__.json', '{"kind":"preset"}\n')
    sub().put('constructor.json', text(preset('constructor')))
    const report = await syncPresets(folder())
    expect(report).toMatchObject({ taken: 1, removedInFolder: 0, removedHere: 0 })
    expect(sub().files.has('__proto__.json')).toBe(true)
    expect(sub().files.has('constructor.json')).toBe(true)
    expect(await db.getPreset('constructor')).toBeDefined()
    // Agreed now: nothing to do on the next pass.
    expect(await syncPresets(folder())).toMatchObject({ taken: 0, written: 0 })
    expect(Object.getPrototypeOf(await db.getSetting('syncPresetState'))).toBe(Object.prototype)
  })
})
