/** A file to start the fake folder with: text, or bytes as base64 (#149), in `dir` if given. */
export interface SeedFile {
  name: string
  dir?: string
  text?: string
  base64?: string
}

/**
 * An in-page stand-in for the folder picker and a directory handle (#107):
 * Playwright cannot click the native picker. Exposes the folder as
 * `window.__syncFolder` so tests can play "the other computer". Files can be
 * text or bytes (images in `_assets`, #149); `seed` fills it at start, as
 * another PC's folder would be.
 */
export function installFakeFolder(seed: SeedFile[] = []): void {
  type FakeFile = { text: string; lastModified: number; bytes?: Uint8Array }
  type BlobLike = { arrayBuffer(): Promise<ArrayBuffer> }
  const fromBase64 = (base64: string) =>
    Uint8Array.from((globalThis as unknown as { atob(s: string): string }).atob(base64), (c) =>
      c.charCodeAt(0),
    )
  interface FakeDir {
    kind: 'directory'
    name: string
    files: Map<string, FakeFile>
    dirs: Map<string, FakeDir>
    values(): AsyncGenerator<unknown>
    getFileHandle(name: string, options?: { create?: boolean }): Promise<unknown>
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDir>
    removeEntry(name: string): Promise<void>
    /** Test helper: 'prompt' plays a browser that wants permission again. */
    permission: 'granted' | 'prompt'
    queryPermission(): Promise<'granted' | 'prompt'>
    requestPermission(): Promise<'granted' | 'prompt'>
    put(name: string, text: string): void
  }
  let clock = Date.now()
  const makeDir = (name: string): FakeDir => {
    const files = new Map<string, FakeFile>()
    const dirs = new Map<string, FakeDir>()
    const fileHandle = (fileName: string) => ({
      kind: 'file' as const,
      name: fileName,
      async getFile() {
        const file = files.get(fileName)
        if (!file) throw Object.assign(new Error(fileName), { name: 'NotFoundError' })
        return {
          lastModified: file.lastModified,
          size: file.bytes?.length ?? file.text.length,
          type: '',
          text: async () => file.text,
          arrayBuffer: async () =>
            (file.bytes ?? new TextEncoder().encode(file.text)).slice().buffer,
        }
      },
      async createWritable() {
        let buffer = ''
        let bytes: Uint8Array | undefined
        return {
          async write(data: string | BlobLike) {
            if (typeof data === 'string') buffer += data
            else bytes = new Uint8Array(await data.arrayBuffer())
          },
          async close() {
            files.set(fileName, {
              text: buffer,
              lastModified: (clock += 1000),
              ...(bytes ? { bytes } : {}),
            })
          },
          async abort() {},
        }
      },
    })
    const dir: FakeDir = {
      kind: 'directory',
      name,
      files,
      dirs,
      async *values() {
        for (const fileName of [...files.keys()]) yield fileHandle(fileName)
        for (const sub of dirs.values()) yield sub
      },
      async getFileHandle(fileName: string, options?: { create?: boolean }) {
        if (!files.has(fileName)) {
          if (!options?.create) throw Object.assign(new Error(fileName), { name: 'NotFoundError' })
          files.set(fileName, { text: '', lastModified: (clock += 1000) })
        }
        return fileHandle(fileName)
      },
      async getDirectoryHandle(subName: string, options?: { create?: boolean }) {
        let sub = dirs.get(subName)
        if (!sub) {
          if (!options?.create) throw Object.assign(new Error(subName), { name: 'NotFoundError' })
          sub = makeDir(subName)
          dirs.set(subName, sub)
        }
        return sub
      },
      async removeEntry(entry: string) {
        if (!files.delete(entry) && !dirs.delete(entry)) {
          throw Object.assign(new Error(entry), { name: 'NotFoundError' })
        }
      },
      permission: 'granted',
      async queryPermission() {
        return dir.permission
      },
      async requestPermission() {
        dir.permission = 'granted'
        return dir.permission
      },
      /** Test helper: write a file as the other computer would. */
      put(fileName: string, text: string) {
        files.set(fileName, { text, lastModified: (clock += 1000) })
      },
    }
    return dir
  }
  const root = makeDir('MindMaps')
  for (const file of seed) {
    let dir = root
    if (file.dir) {
      dir = root.dirs.get(file.dir) ?? makeDir(file.dir)
      root.dirs.set(file.dir, dir)
    }
    dir.files.set(file.name, {
      text: file.text ?? '',
      lastModified: (clock += 1000),
      ...(file.base64 ? { bytes: fromBase64(file.base64) } : {}),
    })
  }
  Object.assign(globalThis, {
    __syncFolder: root,
    showDirectoryPicker: async () => root,
  })
}
