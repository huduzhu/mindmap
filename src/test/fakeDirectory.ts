import type { DirectoryHandleLike, FileHandleLike, Permission } from '../sync/folder'

/**
 * An in-memory stand-in for a File System Access directory handle, for the
 * folder-sync tests (#107). `busy` makes the next N writes or removals fail the
 * way a file held by OneDrive does.
 */
export interface FakeFile {
  text: string
  lastModified: number
  /** Set for a file written as bytes (an image in `_assets`, #149). */
  bytes?: Uint8Array
}

let clock = 1_700_000_000_000
const tick = () => (clock += 1000)

export class FakeDirectory implements DirectoryHandleLike {
  readonly kind = 'directory' as const
  files = new Map<string, FakeFile>()
  dirs = new Map<string, FakeDirectory>()
  permission: Permission = 'granted'
  busy = 0
  /** Names whose reads fail, like a cloud-only file while offline. */
  unreadable = new Set<string>()
  missing = false
  /** Names whose details cannot be read at all, like a file OneDrive is busy with (#116). */
  statFails = new Set<string>()
  /** Names still listed but gone when opened, like a file OneDrive just moved (#113). */
  lost = new Set<string>()
  /** How many times each file was written (#149: asset files are written once). */
  writes = new Map<string, number>()
  readonly name: string

  constructor(name: string) {
    this.name = name
  }

  private check() {
    if (this.missing) throw Object.assign(new Error('gone'), { name: 'NotFoundError' })
  }

  async *values(): AsyncIterable<FileHandleLike | DirectoryHandleLike> {
    this.check()
    for (const name of [...this.files.keys()]) yield this.fileHandle(name)
    for (const dir of this.dirs.values()) yield dir
  }

  private fileHandle(name: string): FileHandleLike {
    return {
      kind: 'file',
      name,
      getFile: async () => {
        this.check()
        const file = this.files.get(name)
        if (!file) throw Object.assign(new Error(name), { name: 'NotFoundError' })
        if (this.statFails.has(name)) {
          throw Object.assign(new Error('busy'), { name: 'NotReadableError' })
        }
        const unavailable = () => {
          if (this.unreadable.has(name)) {
            throw Object.assign(new Error('cloud file unavailable'), { name: 'NotReadableError' })
          }
        }
        return {
          lastModified: file.lastModified,
          size: file.bytes?.length ?? file.text.length,
          text: async () => {
            unavailable()
            return file.text
          },
          arrayBuffer: async () => {
            unavailable()
            const bytes = file.bytes ?? new TextEncoder().encode(file.text)
            return bytes.slice().buffer
          },
        }
      },
      createWritable: async () => {
        this.check()
        let buffer = ''
        let bytes: Uint8Array | undefined
        return {
          write: async (data: string | Blob) => {
            if (typeof data === 'string') buffer += data
            else bytes = new Uint8Array(await data.arrayBuffer())
          },
          close: async () => {
            if (this.busy > 0) {
              this.busy -= 1
              throw Object.assign(new Error('locked'), { name: 'NoModificationAllowedError' })
            }
            this.writes.set(name, (this.writes.get(name) ?? 0) + 1)
            this.files.set(name, {
              text: buffer,
              lastModified: tick(),
              ...(bytes ? { bytes } : {}),
            })
          },
          abort: async () => {},
        }
      },
    }
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike> {
    this.check()
    if (this.lost.has(name)) throw Object.assign(new Error(name), { name: 'NotFoundError' })
    if (!this.files.has(name)) {
      if (!options?.create) throw Object.assign(new Error(name), { name: 'NotFoundError' })
      this.files.set(name, { text: '', lastModified: tick() })
    }
    return this.fileHandle(name)
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectory> {
    this.check()
    let dir = this.dirs.get(name)
    if (!dir) {
      if (!options?.create) throw Object.assign(new Error(name), { name: 'NotFoundError' })
      dir = new FakeDirectory(name)
      this.dirs.set(name, dir)
    }
    return dir
  }

  async removeEntry(name: string): Promise<void> {
    this.check()
    if (this.busy > 0) {
      this.busy -= 1
      throw Object.assign(new Error('locked'), { name: 'NoModificationAllowedError' })
    }
    if (!this.files.delete(name) && !this.dirs.delete(name)) {
      throw Object.assign(new Error(name), { name: 'NotFoundError' })
    }
  }

  async queryPermission(): Promise<Permission> {
    return this.permission
  }

  async requestPermission(): Promise<Permission> {
    if (this.permission === 'prompt') this.permission = 'granted'
    return this.permission
  }

  /** Test helper: put a file as if another PC wrote it. */
  put(name: string, text: string): void {
    this.files.set(name, { text, lastModified: tick() })
  }

  /** Test helper: put a file of bytes as if another PC wrote it. */
  putBytes(name: string, bytes: Uint8Array): void {
    this.files.set(name, { text: '', bytes, lastModified: tick() })
  }

  json(name: string): unknown {
    const file = this.files.get(name)
    return file ? JSON.parse(file.text) : undefined
  }
}
