import { afterEach, describe, expect, it } from 'vitest'
import {
  daysLeftLabel,
  getDetailsPanel,
  isTrashAutoPurgeOn,
  setDetailsPanel,
  setTrashAutoPurge,
} from './session'

const DAY = 24 * 60 * 60 * 1000

describe('trash retention label (#83)', () => {
  const now = Date.parse('2026-09-26T12:00:00.000Z')

  it('counts down from 30 days', () => {
    expect(daysLeftLabel(new Date(now).toISOString(), now)).toBe('deleted forever in 30 days')
    expect(daysLeftLabel(new Date(now - 20 * DAY).toISOString(), now)).toBe(
      'deleted forever in 10 days',
    )
    expect(daysLeftLabel(new Date(now - 29.5 * DAY).toISOString(), now)).toBe(
      'deleted forever within a day',
    )
  })

  it('copes with a missing or unreadable date', () => {
    expect(daysLeftLabel(undefined, now)).toBe('kept 30 days')
    expect(daysLeftLabel('not a date', now)).toBe('kept 30 days')
  })
})

describe('trash auto-purge setting (#83)', () => {
  it('is on by default and remembers "off"', () => {
    expect(isTrashAutoPurgeOn()).toBe(true)
    setTrashAutoPurge(false)
    expect(isTrashAutoPurgeOn()).toBe(false)
    setTrashAutoPurge(true)
    expect(isTrashAutoPurgeOn()).toBe(true)
  })
})

describe('details panel setting (#144)', () => {
  const original = window.matchMedia
  const fakeMatchMedia = (matches: boolean) =>
    ((query: string) => ({ matches, media: query })) as unknown as typeof window.matchMedia

  afterEach(() => {
    window.matchMedia = original
    localStorage.removeItem('mms.detailsPanel')
  })

  it('is shown by default on a desktop and hidden on touch or narrow screens', () => {
    window.matchMedia = fakeMatchMedia(false)
    expect(getDetailsPanel()).toBe('shown')
    window.matchMedia = fakeMatchMedia(true)
    expect(getDetailsPanel()).toBe('hidden')
  })

  it('remembers the last choice on this device, whatever the screen', () => {
    window.matchMedia = fakeMatchMedia(true)
    setDetailsPanel('shown')
    expect(getDetailsPanel()).toBe('shown')
    window.matchMedia = fakeMatchMedia(false)
    setDetailsPanel('hidden')
    expect(localStorage.getItem('mms.detailsPanel')).toBe('hidden')
    expect(getDetailsPanel()).toBe('hidden')
  })
})
