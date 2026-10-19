import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { formatBytes } from '../io/quota'
import { StorageMeter } from './StorageMeter'
import { useToast } from './toastStore'
import { putAsset } from '../assets/store'
import { resetDatabase } from '../test/resetDb'

const original = Object.getOwnPropertyDescriptor(navigator, 'storage')

function stubStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true })
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'storage', original)
  else delete (navigator as { storage?: unknown }).storage
})

describe('StorageMeter (#83)', () => {
  it('shows usage against the quota and offers "Keep my data"', async () => {
    let persisted = false
    stubStorage({
      estimate: async () => ({ usage: 3 * 1024 * 1024, quota: 300 * 1024 * 1024 }),
      persisted: async () => persisted,
      persist: async () => {
        persisted = true
        return true
      },
    })
    render(<StorageMeter />)
    expect(await screen.findByText('Using 3.0 MB of 300 MB (1%)')).toBeTruthy()
    expect(screen.getByText(/may clear this data/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Keep my data' }))
    expect(await screen.findByText(/Protected: the browser will not clear/)).toBeTruthy()
    expect(useToast.getState().message).toMatch(/now protected/)
    expect(screen.queryByRole('button', { name: 'Keep my data' })).toBeNull()
  })

  it('says so when the browser declines', async () => {
    stubStorage({
      estimate: async () => ({ usage: 10, quota: 1000 }),
      persisted: async () => false,
      persist: async () => false,
    })
    render(<StorageMeter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my data' }))
    await waitFor(() => expect(useToast.getState().message).toMatch(/declined/))
    expect(useToast.getState().tone).toBe('error')
  })

  it('counts the bytes images take (#149)', async () => {
    await resetDatabase()
    await putAsset(new Blob([new Uint8Array(3000)], { type: 'image/webp' }), {
      w: 10,
      h: 10,
      thumb: new Blob([new Uint8Array(72)], { type: 'image/webp' }),
    })
    stubStorage({
      estimate: async () => ({ usage: 3 * 1024 * 1024, quota: 300 * 1024 * 1024 }),
      persisted: async () => true,
    })
    render(<StorageMeter />)
    expect(await screen.findByText('Using 3.0 MB of 300 MB (1%); images 3.0 KB')).toBeTruthy()
  })

  it('renders nothing where the Storage API is missing', () => {
    stubStorage(undefined)
    const { container } = render(<StorageMeter />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('formatBytes', () => {
  it('uses binary units with sensible precision', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
  })
})
