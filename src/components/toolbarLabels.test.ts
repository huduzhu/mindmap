import { describe, expect, it } from 'vitest'
import { connectionLabel, saveStatusLabel } from './toolbarLabels'

describe('toolbar status badges (#79)', () => {
  it('names every save state', () => {
    expect(saveStatusLabel('saved')).toBe('Saved')
    expect(saveStatusLabel('pending')).toBe('Unsaved')
    expect(saveStatusLabel('saving')).toBe('Saving…')
    expect(saveStatusLabel('error')).toBe('Save failed')
  })

  it('says what offline means instead of "PWA Cached"', () => {
    expect(connectionLabel(true)).toBe('Online')
    expect(connectionLabel(false)).toBe('Offline (changes stay on this device)')
  })
})
