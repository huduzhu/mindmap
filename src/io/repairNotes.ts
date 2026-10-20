import { tn } from '../i18n'
import '../i18n/en/files'
import type { RepairStats } from './sanitize'

/**
 * The schema's title and notes limits (MAX_TITLE_LENGTH in io/sanitize,
 * MAX_NOTES_LENGTH in schema/constants; sanitize.test checks they agree).
 * Spelled out so this lazily loaded module imports nothing from the startup
 * code beyond i18n, which keeps the startup chunks as they are (H-0).
 */
export const REPAIR_LIMITS = { title: 500, notes: 20000 }

/**
 * What sanitizeProject had to fix, one sentence each. Kept apart from
 * sanitize.ts so its text ships with the lazily loaded import code (H-0).
 */
export function describeRepairs(stats: RepairStats): string[] {
  const notes: string[] = []
  if (stats.repairedIds > 0) notes.push(tn('repair.ids', stats.repairedIds))
  if (stats.repairedTitles > 0) notes.push(tn('repair.titles', stats.repairedTitles))
  if (stats.truncatedTitles > 0) {
    notes.push(tn('repair.longTitles', stats.truncatedTitles, { max: REPAIR_LIMITS.title }))
  }
  if (stats.truncatedNotes > 0) {
    notes.push(tn('repair.longNotes', stats.truncatedNotes, { max: REPAIR_LIMITS.notes }))
  }
  return notes
}
