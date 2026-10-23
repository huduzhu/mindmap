/**
 * The sync folder behind a small interface (#107): the real one wraps a
 * File System Access directory handle; tests use an in-memory one. Every
 * operation the sync engine needs, and nothing else.
 */

export interface FolderFile {
  name: string
  lastModified: number
  size: number
  /** Listed, but its details could not be read (OneDrive busy with it): try again later (#116). */
  unavailable?: boolean
}

export interface SyncFolder {
  readonly name: string
  /** Files directly in the folder (not in subfolders). */
  listFiles(): Promise<FolderFile[]>
  readText(name: string): Promise<{ text: string; lastModified: number }>
  /** Replaces the file whole; returns its new modification time. */
  writeText(name: string, text: string): Promise<number>
  /** Moves a file into a subfolder (created when missing), never overwriting there. */
  moveTo(name: string, subfolder: string): Promise<void>
  subfolder(name: string, create: boolean): Promise<SyncFolder | null>
  /** Names of the files directly in the folder, without reading their details (#149). */
  listNames(): Promise<string[]>
  /** A file's bytes, e.g. an image in `_assets` (#149). */
  readBytes(name: string): Promise<Blob>
  /** Creates or replaces a file with these bytes. */
  writeBytes(name: string, data: Blob): Promise<void>
  /** Removes a file (only used after a copy is safely somewhere else). */
  remove(name: string): Promise<void>
}

export type Permission = 'granted' | 'denied' | 'prompt'

/** What the sync needs from a FileSystemDirectoryHandle (and what the E2E fake provides). */
export interface DirectoryHandleLike {
  readonly kind: 'directory'
  readonly name: string
  values(): AsyncIterable<FileHandleLike | DirectoryHandleLike>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>
  removeEntry(name: string): Promise<void>
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<Permission>
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<Permission>
}

export interface FileHandleLike {
  readonly kind: 'file'
  readonly name: string
  getFile(): Promise<{
    lastModified: number
    size: number
    text(): Promise<string>
    arrayBuffer(): Promise<ArrayBuffer>
    type?: string
  }>
  createWritable(options?: { keepExistingData?: boolean }): Promise<{
    write(data: string | Blob): Promise<void>
    close(): Promise<void>
    abort?(): Promise<void>
  }>
}

/** Retry delays for files OneDrive or the virus scanner briefly hold (plan §0a-1). */
export const RETRY_DELAYS_MS = [500, 1000, 2000]

const NOT_RETRYABLE = new Set(['NotFoundError', 'TypeError', 'SecurityError', 'AbortError'])

export class FolderBusyError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'FolderBusyError'
  }
}

/** Run `operation`, retrying transient failures; permission and missing-file errors are not retried. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  delays: number[] = RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const name = (error as { name?: string } | null)?.name ?? ''
      if (NOT_RETRYABLE.has(name) || name === 'NotAllowedError') throw error
      if (attempt < delays.length) await sleep(delays[attempt])
    }
  }
  throw new FolderBusyError(lastError)
}

export function wrapHandle(
  handle: DirectoryHandleLike,
  delays: number[] = RETRY_DELAYS_MS,
): SyncFolder {
  const retry = <T>(operation: () => Promise<T>) => withRetry(operation, delays)
  const writeFile = (name: string, text: string | Blob): Promise<number> =>
    retry(async () => {
      const fileHandle = await handle.getFileHandle(name, { create: true })
      // Chromium writes to a hidden swap file and swaps it in on close(),
      // so OneDrive never syncs a half-written file.
      const writable = await fileHandle.createWritable({ keepExistingData: false })
      try {
        await writable.write(text)
        await writable.close()
      } catch (error) {
        await writable.abort?.().catch(() => undefined)
        throw error
      }
      return (await fileHandle.getFile()).lastModified
    })
  const folder: SyncFolder = {
    name: handle.name,
    async listFiles() {
      const files: FolderFile[] = []
      for await (const entry of handle.values()) {
        if (entry.kind !== 'file') continue
        // Metadata only: this does not download a cloud-only OneDrive file.
        // One file OneDrive is busy with must not stop the whole pass (#116).
        try {
          const file = await entry.getFile()
          files.push({ name: entry.name, lastModified: file.lastModified, size: file.size })
        } catch {
          files.push({ name: entry.name, lastModified: 0, size: 0, unavailable: true })
        }
      }
      return files
    },
    async readText(name) {
      const file = await (await handle.getFileHandle(name)).getFile()
      return { text: await file.text(), lastModified: file.lastModified }
    },
    async listNames() {
      const names: string[] = []
      for await (const entry of handle.values()) if (entry.kind === 'file') names.push(entry.name)
      return names
    },
    async readBytes(name) {
      const file = await (await handle.getFileHandle(name)).getFile()
      return new Blob([await file.arrayBuffer()], { type: file.type ?? '' })
    },
    async writeBytes(name, data) {
      await writeFile(name, data)
    },
    async remove(name) {
      await retry(() => handle.removeEntry(name))
    },
    writeText: (name, text) => writeFile(name, text),
    async moveTo(name, subfolder) {
      const target = await handle.getDirectoryHandle(subfolder, { create: true })
      const { text } = await folder.readText(name)
      const stem = name.replace(/\.json$/i, '')
      // Only a name that is certainly free is used: a folder of that name is
      // skipped, and any other failure stops the move (retried like other
      // operations), so an existing file in the trash is never overwritten.
      const taken = (candidate: string) =>
        retry(async () => {
          try {
            await target.getFileHandle(candidate)
            return true
          } catch (error) {
            const errorName = (error as { name?: string } | null)?.name
            if (errorName === 'NotFoundError') return false
            if (errorName === 'TypeMismatchError') return true
            throw error
          }
        })
      let candidate = name
      for (let n = 2; await taken(candidate); n++) candidate = `${stem} (${n}).json`
      await wrapHandle(target, delays).writeText(candidate, text)
      await retry(() => handle.removeEntry(name))
    },
    async subfolder(name, create) {
      try {
        return wrapHandle(await handle.getDirectoryHandle(name, { create }), delays)
      } catch (error) {
        if ((error as { name?: string })?.name === 'NotFoundError' && !create) return null
        throw error
      }
    },
  }
  return folder
}
