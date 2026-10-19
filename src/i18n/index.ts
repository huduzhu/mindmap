import { create } from 'zustand'
import { lazyImport } from '../pwa/update'
import { en } from './en'
import type { commandsMessages } from './en/commands'
import type { exportMessages } from './en/export'
import type { filesMessages } from './en/files'
import type { githubMessages } from './en/github'
import type { imagesMessages } from './en/images'
import type { outlinerMessages } from './en/outliner'
import type { pickersMessages } from './en/pickers'
import type { presetsMessages } from './en/presets'
import type { presentMessages } from './en/present'
import type { shortcutsMessages } from './en/shortcuts'
import type { snapshotsMessages } from './en/snapshots'
import type { syncMessages } from './en/sync'
import type { tagsMessages } from './en/tags'
import type { trashMessages } from './en/trash'
import type { Role } from '../schema/constants'

/**
 * Every message key: the startup table (en.ts) plus the per-area tables in
 * en/ that ship with the lazily loaded chunks using them (H-0).
 */
export type MessageKey =
  | keyof typeof en
  | keyof typeof commandsMessages
  | keyof typeof exportMessages
  | keyof typeof filesMessages
  | keyof typeof githubMessages
  | keyof typeof imagesMessages
  | keyof typeof outlinerMessages
  | keyof typeof pickersMessages
  | keyof typeof presetsMessages
  | keyof typeof presentMessages
  | keyof typeof shortcutsMessages
  | keyof typeof snapshotsMessages
  | keyof typeof syncMessages
  | keyof typeof tagsMessages
  | keyof typeof trashMessages
export type Locale = 'en' | 'zh-CN'

/** Each locale's name in its own language, for the switcher. */
export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'zh-CN', name: '简体中文' },
]

type Table = Record<MessageKey, string>

/**
 * English: the startup table, plus each area table once its chunk has loaded
 * (H-0). Area tables add themselves through `registerMessages`.
 */
const english: Partial<Table> = { ...en }

/**
 * Add an area's English table. Each file in en/ calls this when it is
 * evaluated, and every module using one of its keys imports that file, so the
 * text is in place before any of the module's code can run.
 */
export function registerMessages(table: Partial<Table>): void {
  Object.assign(english, table)
}

/**
 * Most English ships in the entry chunk; other languages are separate chunks
 * loaded when chosen (#88, #89), so English-only visitors never download them.
 * Chinese stays one table: once chosen, every area needs it anyway.
 */
const LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<Table>> = {
  'zh-CN': () => lazyImport(() => import('./zh-CN')).then((m) => m.zhCN),
}
const loaded: Partial<Record<Locale, Partial<Table>>> = { en: english }

/** Load a language's table. For English it holds the areas registered so far. */
export async function loadMessages(locale: Locale): Promise<Partial<Table>> {
  const table = loaded[locale] ?? (await LOADERS[locale as Exclude<Locale, 'en'>]())
  loaded[locale] = table
  return table
}

const STORAGE_KEY = 'mms.locale'

/** Stored choice first, then the browser's language (#89, decision L-D1: zh → Simplified). */
export function detectLocale(): Locale {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'zh-CN') return stored
  } catch {
    // No storage: fall through to the browser language.
  }
  const languages = globalThis.navigator?.languages?.length
    ? globalThis.navigator.languages
    : [globalThis.navigator?.language ?? 'en']
  return languages.some((language) => /^zh\b/i.test(language)) ? 'zh-CN' : 'en'
}

/** The language on screen. It changes only once that language's table has loaded. */
export const useLocale = create<{ locale: Locale }>()(() => ({ locale: 'en' }))

let requested: Locale = 'en'

async function show(locale: Locale): Promise<void> {
  requested = locale
  try {
    await loadMessages(locale)
  } catch {
    return // offline and not cached: stay in the current language
  }
  if (requested === locale) useLocale.setState({ locale })
}

/** Switch the interface language and remember the choice. */
export async function setLocale(locale: Locale): Promise<void> {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale)
  } catch {
    // Not remembered; still switches for this session.
  }
  await show(locale)
}

/** Start in the stored or browser language (called once at startup). */
export function initLocale(): Promise<void> {
  return show(detectLocale())
}

export type MessageParams = Record<string, string | number>

export function format(template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

const missing = new Set<string>()

/**
 * Keys asked for before their table was there (H-0): `t` shows the key itself.
 * Tests assert this stays empty; it means a module forgot to import its area.
 */
export function missingMessages(): string[] {
  return [...missing]
}

export function clearMissingMessages(): void {
  missing.clear()
}

/** Translate `key` in the current locale. Outside React; components use `useT`. */
export function t(key: MessageKey, params?: MessageParams): string {
  const text = loaded[useLocale.getState().locale]?.[key] ?? english[key]
  if (text === undefined) {
    missing.add(key)
    return key
  }
  return format(text, params)
}

/** `t` for components: re-renders when the language changes. */
export function useT(): typeof t {
  useLocale((state) => state.locale)
  return t
}

type PluralBase = {
  [K in MessageKey]: K extends `${infer Base}.one` ? Base : never
}[MessageKey]

/** `t` for counted messages: picks `<base>.one` or `<base>.other` and passes `count`. */
export function tn(base: PluralBase, count: number, params: MessageParams = {}): string {
  return t(`${base}.${count === 1 ? 'one' : 'other'}` as MessageKey, { count, ...params })
}

/** Display names for node roles and sides (#99); the stored values stay English. */
export function roleLabel(role: Role): string {
  return t(`role.${role}` as MessageKey)
}
