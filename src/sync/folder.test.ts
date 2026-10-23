import { describe, expect, it } from 'vitest'
import { FakeDirectory } from '../test/fakeDirectory'
import { FolderBusyError, wrapHandle } from './folder'

/** A folder with Plan.json and a `_trash` subfolder, wrapped without retry delays. */
function setup() {
  const dir = new FakeDirectory('Sync')
  dir.put('Plan.json', 'new')
  const trash = new FakeDirectory('_trash')
  dir.dirs.set('_trash', trash)
  return { dir, trash, folder: wrapHandle(dir, [0, 0]) }
}

describe('moving a file to the trash (#111)', () => {
  it('numbers the name when the trash already has that file', async () => {
    const { dir, trash, folder } = setup()
    trash.put('Plan.json', 'old')
    await folder.moveTo('Plan.json', '_trash')
    expect(trash.files.get('Plan.json')?.text).toBe('old')
    expect(trash.files.get('Plan (2).json')?.text).toBe('new')
    expect(dir.files.has('Plan.json')).toBe(false)
  })

  it('skips a name taken by a folder', async () => {
    const { dir, trash, folder } = setup()
    trash.dirs.set('Plan.json', new FakeDirectory('Plan.json'))
    trash.put('Plan (2).json', 'old')
    await folder.moveTo('Plan.json', '_trash')
    expect(trash.files.get('Plan (2).json')?.text).toBe('old')
    expect(trash.files.get('Plan (3).json')?.text).toBe('new')
    expect(dir.files.has('Plan.json')).toBe(false)
  })

  it('checks a busy name again instead of writing over it', async () => {
    const { dir, trash, folder } = setup()
    trash.put('Plan.json', 'old')
    trash.lookupFails.set('Plan.json', ['NotReadableError'])
    await folder.moveTo('Plan.json', '_trash')
    expect(trash.files.get('Plan.json')?.text).toBe('old')
    expect(trash.files.get('Plan (2).json')?.text).toBe('new')
    expect(dir.files.has('Plan.json')).toBe(false)
  })

  it('never overwrites a trash file it could not check; the move fails instead', async () => {
    const { dir, trash, folder } = setup()
    trash.put('Plan.json', 'old')
    trash.lookupFails.set('Plan.json', Array(10).fill('NotReadableError'))
    await expect(folder.moveTo('Plan.json', '_trash')).rejects.toBeInstanceOf(FolderBusyError)
    expect(trash.files.get('Plan.json')?.text).toBe('old')
    expect(dir.files.get('Plan.json')?.text).toBe('new')
  })

  it('stops at once when the browser refuses access', async () => {
    const { dir, trash, folder } = setup()
    trash.lookupFails.set('Plan.json', ['NotAllowedError'])
    await expect(folder.moveTo('Plan.json', '_trash')).rejects.toMatchObject({
      name: 'NotAllowedError',
    })
    expect(trash.files.size).toBe(0)
    expect(dir.files.has('Plan.json')).toBe(true)
  })
})
