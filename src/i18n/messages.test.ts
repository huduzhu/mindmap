import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { en as core } from './en'
import { commandsMessages } from './en/commands'
import { exportMessages } from './en/export'
import { filesMessages } from './en/files'
import { githubMessages } from './en/github'
import { outlinerMessages } from './en/outliner'
import { pickersMessages } from './en/pickers'
import { presetsMessages } from './en/presets'
import { shortcutsMessages } from './en/shortcuts'
import { snapshotsMessages } from './en/snapshots'
import { syncMessages } from './en/sync'
import { trashMessages } from './en/trash'
import { presentMessages } from './en/present'
import { tagsMessages } from './en/tags'
import { imagesMessages } from './en/images'
import {
  clearMissingMessages,
  detectLocale,
  format,
  loadMessages,
  LOCALES,
  missingMessages,
  registerMessages,
  setLocale,
  t,
  useLocale,
  type MessageKey,
} from './index'

/** The area tables (H-0); the test below checks none is left out. */
const AREAS: Record<string, Record<string, string>> = {
  commands: commandsMessages,
  export: exportMessages,
  files: filesMessages,
  github: githubMessages,
  outliner: outlinerMessages,
  pickers: pickersMessages,
  presets: presetsMessages,
  shortcuts: shortcutsMessages,
  snapshots: snapshotsMessages,
  sync: syncMessages,
  trash: trashMessages,
  present: presentMessages,
  tags: tagsMessages,
  images: imagesMessages,
}
const en: Record<string, string> = Object.assign({}, core, ...Object.values(AREAS))

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

afterEach(() => {
  useLocale.setState({ locale: 'en' })
})

describe('message tables (#89)', () => {
  for (const { id } of LOCALES) {
    it(`${id} has every key, none empty, with the same placeholders as English`, async () => {
      const table = await loadMessages(id)
      const missing = Object.keys(en).filter((key) => !(key in table))
      expect(missing).toEqual([])
      const extra = Object.keys(table).filter((key) => !(key in en))
      expect(extra).toEqual([])
      for (const [key, english] of Object.entries(en)) {
        const text = table[key as MessageKey] ?? ''
        expect(text.trim(), key).not.toBe('')
        expect(placeholders(text), key).toEqual(placeholders(english))
      }
    })
  }

  it('lists every area table, and no key is in two tables (H-0)', () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'en')
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
      .map((name) => name.replace(/\.ts$/, ''))
      .sort()
    expect(files).toEqual(Object.keys(AREAS).sort())
    const tables = [core, ...Object.values(AREAS)]
    const total = tables.reduce((sum, table) => sum + Object.keys(table).length, 0)
    expect(Object.keys(en).length).toBe(total)
  })

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(format('Hi {name}, {n} left', { name: 'Ann', n: 3 })).toBe('Hi Ann, 3 left')
    expect(format('Hi {name}', {})).toBe('Hi {name}')
  })

  it('switches language and remembers the choice', async () => {
    expect(t('start.new')).toBe('Start a new project')
    await setLocale('zh-CN')
    expect(t('start.new')).toBe('新建项目')
    expect(localStorage.getItem('mms.locale')).toBe('zh-CN')
    expect(detectLocale()).toBe('zh-CN')
  })

  it('picks Simplified Chinese for any zh browser language, English otherwise', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'languages')
    const setLanguages = (languages: string[]) =>
      Object.defineProperty(navigator, 'languages', { value: languages, configurable: true })
    try {
      setLanguages(['zh-TW', 'en'])
      expect(detectLocale()).toBe('zh-CN')
      setLanguages(['fr-FR', 'en-GB'])
      expect(detectLocale()).toBe('en')
    } finally {
      if (original) Object.defineProperty(navigator, 'languages', original)
      else delete (navigator as { languages?: unknown }).languages
    }
  })
})

describe('area tables (H-0)', () => {
  afterEach(() => clearMissingMessages())

  it('registered areas are in the English table', async () => {
    const english = await loadMessages('en')
    expect(english['sync.title']).toBe(syncMessages['sync.title'])
    expect(t('presets.title')).toBe(en['presets.title'])
    expect(missingMessages()).toEqual([])
  })

  it('shows the key and records it while its table is not loaded', () => {
    const key = 'h0test.later' as MessageKey
    expect(t(key)).toBe('h0test.later')
    expect(missingMessages()).toEqual(['h0test.later'])
    registerMessages({ [key]: 'Now {n}' })
    expect(t(key, { n: 2 })).toBe('Now 2')
    clearMissingMessages()
    expect(missingMessages()).toEqual([])
  })

  it('Chinese covers area keys whether or not the English area was loaded', async () => {
    await setLocale('zh-CN')
    const zh = await loadMessages('zh-CN')
    expect(t('github.title')).toBe(zh['github.title'])
    expect(missingMessages()).toEqual([])
  })
})

describe('role and side labels (#99)', () => {
  it('every role has a label in every language', async () => {
    const { ROLES } = await import('../schema/constants')
    const zh = await loadMessages('zh-CN')
    for (const role of ROLES) {
      const key = `role.${role}` as MessageKey
      expect(en[key]).toBeTruthy()
      expect(zh[key]).toBeTruthy()
    }
  })
})
