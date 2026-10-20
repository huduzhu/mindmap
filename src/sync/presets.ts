/**
 * Custom presets travel with the folder too (V9), in `_presets`. Like the
 * projects (#115): a three-way compare of this browser, the folder and what
 * the two last agreed on, so edits and deletions reach the other PCs. A
 * preset changed on both sides keeps this PC's version and adds the other as
 * a copy. Removed files move to `_trash`.
 */
import * as db from '../io/db'
import { BUILT_IN_PRESETS } from '../io/seed'
import { presetChanged } from '../hooks/usePreset'
import { suggestName } from '../components/presetNames'
import { validateDoc } from '../schema/validate'
import type { Preset } from '../schema/types'
import type { FolderFile, SyncFolder } from './folder'
import { canonicalJson, PRESETS_DIR, textHash, TRASH_DIR } from './names'

export const PRESET_STATE_KEY = 'syncPresetState'

/** What this browser and the folder last agreed on, per preset name. */
export type PresetSyncState = Record<string, { hash: string; lastModified: number }>

export interface PresetSyncReport {
  taken: number
  written: number
  removedHere: number
  removedInFolder: number
  conflicts: string[]
}

export function presetHash(preset: Preset): string {
  return textHash(canonicalJson(preset))
}

const stemOf = (file: FolderFile) => file.name.replace(/\.json$/i, '')
const presetText = (preset: Preset) => `${JSON.stringify(preset, null, 2)}\n`
const isBuiltIn = (name: string) => BUILT_IN_PRESETS.some((preset) => preset.name === name)

async function readPreset(folder: SyncFolder, file: FolderFile): Promise<Preset | null> {
  try {
    const doc = JSON.parse((await folder.readText(file.name)).text) as Preset
    const name = file.name.replace(/\.json$/i, '')
    if (doc?.kind !== 'preset' || doc.name !== name || !validateDoc(doc).ok) return null
    return doc
  } catch {
    // Unreadable (not downloaded yet) or not a preset: try again next time.
    return null
  }
}

export async function syncPresets(
  root: SyncFolder,
  options: { allowDeletes?: boolean } = {},
): Promise<PresetSyncReport> {
  const report: PresetSyncReport = {
    taken: 0,
    written: 0,
    removedHere: 0,
    removedInFolder: 0,
    conflicts: [],
  }
  const folder = await root.subfolder(PRESETS_DIR, true)
  if (!folder) return report
  const local = new Map(
    (await db.listPresets())
      .filter((preset) => !isBuiltIn(preset.name))
      .map((preset) => [preset.name, preset]),
  )
  const listed = (await folder.listFiles()).filter((file) => /\.json$/i.test(file.name))
  // Listed but unreadable for now (#116): present, so not "deleted elsewhere".
  const busy = new Set(listed.filter((file) => file.unavailable).map((f) => stemOf(f)))
  const files = new Map(listed.filter((file) => !file.unavailable).map((f) => [stemOf(f), f]))
  // Keyed by preset (file) name, so no prototype: "__proto__.json" or
  // "constructor.json" in the folder must be ordinary names, not inherited
  // properties that look like an earlier sync.
  const state: PresetSyncState = Object.assign(
    Object.create(null) as PresetSyncState,
    await db.getSetting<PresetSyncState>(PRESET_STATE_KEY),
  )
  // Like the projects' mass-deletion guard (#123): a _presets folder that is
  // empty although two or more presets were synced looks like a paused
  // OneDrive or the wrong folder, not like deletions.
  const agreedCount = Object.keys(state).length
  const allowDeletes = options.allowDeletes !== false && !(listed.length === 0 && agreedCount >= 2)
  const inUse = new Set(
    (await db.listProjects())
      .filter((record) => !record.deletedAt)
      .map((record) => record.project.preset)
      .filter((preset): preset is string => typeof preset === 'string'),
  )

  const write = async (preset: Preset) => {
    const lastModified = await folder.writeText(`${preset.name}.json`, presetText(preset))
    state[preset.name] = { hash: presetHash(preset), lastModified }
    report.written += 1
  }
  const take = async (preset: Preset, file: FolderFile) => {
    await db.putPreset(preset)
    presetChanged(preset)
    state[preset.name] = { hash: presetHash(preset), lastModified: file.lastModified }
    report.taken += 1
  }

  const names = new Set([...local.keys(), ...files.keys(), ...Object.keys(state)])
  for (const name of names) {
    if (isBuiltIn(name) || busy.has(name)) continue
    const mine = local.get(name)
    const file = files.get(name)
    const agreed = Object.hasOwn(state, name) ? state[name] : undefined
    try {
      if (!file) {
        if (!mine) {
          delete state[name]
        } else if (
          agreed &&
          agreed.hash === presetHash(mine) &&
          (inUse.has(name) || !allowDeletes)
        ) {
          // Removed elsewhere, but kept here for now: in use, or deletions are paused.
          if (inUse.has(name)) await write(mine)
        } else if (agreed && agreed.hash === presetHash(mine)) {
          // Gone from the folder and unchanged here: removed on another PC.
          await db.deletePreset(name)
          delete state[name]
          report.removedHere += 1
        } else {
          // New here, or changed here since: it goes (back) to the folder.
          await write(mine)
        }
      } else if (!mine) {
        if (agreed) {
          // Deleted here after it was synced.
          await folder.moveTo(file.name, TRASH_DIR)
          delete state[name]
          report.removedInFolder += 1
        } else {
          const theirs = await readPreset(folder, file)
          if (theirs) await take(theirs, file)
        }
      } else {
        const localChanged = !agreed || presetHash(mine) !== agreed.hash
        const fileChanged = !agreed || file.lastModified !== agreed.lastModified
        if (!fileChanged) {
          if (localChanged) await write(mine)
          continue
        }
        const theirs = await readPreset(folder, file)
        if (!theirs) continue
        if (presetHash(theirs) === presetHash(mine)) {
          state[name] = { hash: presetHash(mine), lastModified: file.lastModified }
        } else if (!localChanged) {
          await take(theirs, file)
        } else {
          // Changed on both sides: this PC's version stays; the other is kept as a copy.
          const taken = new Set([
            ...local.keys(),
            ...files.keys(),
            ...BUILT_IN_PRESETS.map((p) => p.name),
          ])
          const copy = { ...theirs, name: suggestName(`${name}-conflict`, taken) }
          await db.putPreset(copy)
          presetChanged(copy)
          local.set(copy.name, copy)
          await write(copy)
          await write(mine)
          report.conflicts.push(name)
        }
      }
    } catch {
      // A file in use or gone mid-pass: try again next time.
    }
  }
  await db.putSetting(PRESET_STATE_KEY, state)
  return report
}
