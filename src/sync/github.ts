/**
 * GitHub milestones (#112b, Batch Y): save a project to a private GitHub repo
 * as a commit (optionally tagged), list those commits, and fetch one back.
 * Talks to the GitHub REST API directly from the browser with a fine-grained
 * personal access token that the user keeps in this browser only.
 *
 * Images (#149, decision HC-D5): a milestone also commits each image the
 * project uses as `<folder>/assets/<hash>.<ext>` when the repository does not
 * have it yet (one listing of that folder tells). Each image is its own
 * contents-API commit ("<message> (image)") made before the project's commit,
 * so the milestone commit (and its tag) has every image it refers to; the
 * history lists only the project's commits. Simpler and more robust than the
 * git data API (no trees to build), at the cost of extra commits. Up to 10 MB
 * of new image bytes per milestone; above that only the project is committed
 * and the dialog warns. Restoring a milestone fetches its missing images.
 */
import type { ProjectRecord } from '../io/db'
import { t } from '../i18n'
import '../i18n/en/github'
import type { Project } from '../schema/types'
import { imageCodec } from '../assets/codec'
import { importAssetBlob } from '../assets/process'
import {
  assetFileName,
  blobBytes,
  collectAssetRefs,
  getAsset,
  hasAsset,
  typeForFileName,
} from '../assets/store'
import { hashFromAssetName } from './assets'
import { projectFileText, parseProjectFile, type ParsedFile } from './engine'

export interface GitHubSettings {
  /** "owner/name" of a private repository. */
  repo: string
  token: string
  /** Branch to commit to; the repository's default branch when empty. */
  branch?: string
  /** Folder inside the repository for the project files. */
  folder: string
}

export interface Milestone {
  sha: string
  message: string
  date: string
}

export interface MilestoneResult {
  /** The milestone (project) commit. */
  sha: string
  /** Images committed with it. */
  images: number
  /** New images left out: more than 10 MB of them (HC-D5). */
  imagesSkipped: number
}

/** Most new image bytes one milestone commits (HC-D5). */
export const MAX_MILESTONE_IMAGE_BYTES = 10 * 1024 * 1024

export const GITHUB_SETTINGS_KEY = 'github'
export const DEFAULT_GITHUB_FOLDER = 'mindmaps'
const API = 'https://api.github.com'

export class GitHubError extends Error {
  readonly code: 'token' | 'not-found' | 'public' | 'forbidden' | 'conflict' | 'network' | 'other'
  constructor(code: GitHubError['code'], message: string) {
    super(message)
    this.name = 'GitHubError'
    this.code = code
  }
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const TAG = /^(?!.*\.\.)(?!.*\.lock$)[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/

export function isValidRepo(repo: string): boolean {
  const trimmed = repo.trim()
  return REPO.test(trimmed) && !trimmed.split('/').some((part) => part === '.' || part === '..')
}

export function isValidTag(tag: string): boolean {
  return TAG.test(tag) && !tag.startsWith('-') && !tag.endsWith('.')
}

/** Characters a folder may not contain: they would change the API URL's meaning. */
function unsafeFolderChar(segment: string): boolean {
  for (const char of segment) {
    const code = char.charCodeAt(0)
    if (code < 0x20 || code === 0x7f || char === '?' || char === '#' || char === '\\') return true
  }
  return false
}

/**
 * The repository folder normalised ("/maps//2026/" → "maps/2026"; "" for the
 * root), or null when it is not safe to put into an API path: "." or ".."
 * segments, "?", "#", backslashes or control characters.
 */
export function normalizeFolder(folder: string): string | null {
  if (folder.length > 500) return null
  const segments = folder
    .trim()
    .split('/')
    .filter((segment) => segment !== '')
  const bad = segments.some(
    (segment) => segment === '.' || segment === '..' || unsafeFolderChar(segment),
  )
  return bad ? null : segments.join('/')
}

export function isValidFolder(folder: string): boolean {
  return normalizeFolder(folder) !== null
}

function folderPrefix(settings: GitHubSettings): string {
  const folder = normalizeFolder(settings.folder)
  if (folder === null) throw new GitHubError('other', t('github.folderInvalid'))
  return folder ? `${folder}/` : ''
}

/** A repository path for a contents-API URL, each segment encoded. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** One file per project, named by id so a rename keeps its history together. */
export function projectPath(settings: GitHubSettings, id: string): string {
  return `${folderPrefix(settings)}${id}.mindmap.json`
}

/** The folder of the images, next to the project files (#149). */
export function assetsPath(settings: GitHubSettings): string {
  return `${folderPrefix(settings)}assets`
}

function toBase64(text: string | Uint8Array): string {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

async function call<T>(
  settings: GitHubSettings,
  path: string,
  init: { method?: string; body?: unknown; raw?: boolean | 'bytes' } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        // Raw file content works for files over 1 MB, where the JSON form has none (#122).
        Accept: init.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        Authorization: `Bearer ${settings.token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch (error) {
    throw new GitHubError('network', error instanceof Error ? error.message : String(error))
  }
  if (response.ok) {
    if (init.raw === 'bytes') return (await response.arrayBuffer()) as T
    return (init.raw ? await response.text() : await response.json()) as T
  }
  const detail = await response
    .json()
    .then((body: { message?: string }) => body?.message ?? '')
    .catch(() => '')
  if (response.status === 401) throw new GitHubError('token', detail || 'Bad credentials')
  if (response.status === 404) throw new GitHubError('not-found', detail || 'Not Found')
  if (response.status === 403) throw new GitHubError('forbidden', detail || 'Forbidden')
  if (response.status === 409 || response.status === 422)
    throw new GitHubError('conflict', detail || `HTTP ${response.status}`)
  throw new GitHubError('other', detail || `HTTP ${response.status}`)
}

/** Check the token can see the repository and that it is private; returns the branch to use. */
export async function checkRepo(settings: GitHubSettings): Promise<string> {
  const repo = await call<{ private: boolean; default_branch: string }>(
    settings,
    `/repos/${settings.repo.trim()}`,
  )
  if (!repo.private) {
    throw new GitHubError('public', 'public repository')
  }
  return settings.branch?.trim() || repo.default_branch
}

/** The image files in the repository's assets folder at `ref`, by hash. */
async function repoAssets(settings: GitHubSettings, ref: string): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  try {
    const listing = await call<{ name: string; type: string }[]>(
      settings,
      `/repos/${settings.repo.trim()}/contents/${encodePath(assetsPath(settings))}?ref=${encodeURIComponent(ref)}`,
    )
    for (const entry of Array.isArray(listing) ? listing : []) {
      const hash = entry.type === 'file' ? hashFromAssetName(entry.name) : null
      if (hash) found.set(hash, entry.name)
    }
  } catch (error) {
    if (!(error instanceof GitHubError && error.code === 'not-found')) throw error
  }
  return found
}

const projectRefs = (project: Project) => collectAssetRefs([project.map, project.brainstorm])

/** Commit the images the project uses that the repository lacks (HC-D5). */
async function commitImages(
  settings: GitHubSettings,
  project: Project,
  branch: string,
  message: string,
): Promise<{ images: number; imagesSkipped: number }> {
  const refs = projectRefs(project)
  if (refs.size === 0) return { images: 0, imagesSkipped: 0 }
  const there = await repoAssets(settings, branch)
  const files: { name: string; bytes: Uint8Array }[] = []
  for (const hash of refs) {
    if (there.has(hash)) continue
    const blob = await getAsset(hash)
    if (!blob) continue // not in this browser: nothing to commit
    files.push({
      name: assetFileName(hash, blob.type),
      bytes: new Uint8Array(await blobBytes(blob)),
    })
  }
  const total = files.reduce((sum, file) => sum + file.bytes.length, 0)
  if (total > MAX_MILESTONE_IMAGE_BYTES) return { images: 0, imagesSkipped: files.length }
  const repo = settings.repo.trim()
  for (const file of files) {
    try {
      await call(
        settings,
        `/repos/${repo}/contents/${encodePath(`${assetsPath(settings)}/${file.name}`)}`,
        {
          method: 'PUT',
          body: { message: `${message} (image)`, content: toBase64(file.bytes), branch },
        },
      )
    } catch (error) {
      // Already there (committed meanwhile): same name, same bytes.
      if (!(error instanceof GitHubError && error.code === 'conflict')) throw error
    }
  }
  return { images: files.length, imagesSkipped: 0 }
}

/**
 * Commit the project file, after the images it uses that the repository
 * lacks; with a tag, also tag the project's commit.
 */
export async function saveMilestone(
  settings: GitHubSettings,
  record: ProjectRecord,
  message: string,
  tag?: string,
): Promise<MilestoneResult> {
  const branch = await checkRepo(settings)
  const images = await commitImages(settings, record.project, branch, message)
  const path = projectPath(settings, record.id)
  const repo = settings.repo.trim()
  let sha: string | undefined
  try {
    const existing = await call<{ sha: string }>(
      settings,
      `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    )
    sha = existing.sha
  } catch (error) {
    if (!(error instanceof GitHubError && error.code === 'not-found')) throw error
  }
  const result = await call<{ commit: { sha: string } }>(
    settings,
    `/repos/${repo}/contents/${encodePath(path)}`,
    {
      method: 'PUT',
      body: {
        message,
        content: toBase64(projectFileText(record)),
        branch,
        ...(sha ? { sha } : {}),
      },
    },
  )
  const commitSha = result.commit.sha
  if (tag) {
    await call(settings, `/repos/${repo}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/tags/${tag}`, sha: commitSha },
    })
  }
  return { sha: commitSha, ...images }
}

/** The project's milestones, newest first. */
export async function listMilestones(settings: GitHubSettings, id: string): Promise<Milestone[]> {
  const branch = await checkRepo(settings)
  const commits = await call<
    { sha: string; commit: { message: string; author?: { date?: string } } }[]
  >(
    settings,
    `/repos/${settings.repo.trim()}/commits?path=${encodeURIComponent(
      projectPath(settings, id),
    )}&sha=${encodeURIComponent(branch)}&per_page=30`,
  )
  return commits.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    date: commit.commit.author?.date ?? '',
  }))
}

/** The project as it was in one milestone. */
export async function readMilestone(
  settings: GitHubSettings,
  id: string,
  sha: string,
): Promise<ParsedFile> {
  const text = await call<string>(
    settings,
    `/repos/${settings.repo.trim()}/contents/${encodePath(projectPath(settings, id))}?ref=${encodeURIComponent(sha)}`,
    { raw: true },
  )
  return parseProjectFile(text)
}

/**
 * Fetch the images a milestone's project uses that this browser lacks, from
 * the repository as it was at `sha`. Returns how many are still missing.
 */
export async function fetchMilestoneImages(
  settings: GitHubSettings,
  project: Project,
  sha: string,
): Promise<{ imported: number; missing: number }> {
  const result = { imported: 0, missing: 0 }
  const needed: string[] = []
  for (const hash of projectRefs(project)) if (!(await hasAsset(hash))) needed.push(hash)
  if (needed.length === 0) return result
  const there = await repoAssets(settings, sha)
  for (const hash of needed) {
    const name = there.get(hash)
    if (!name) {
      result.missing += 1
      continue
    }
    const bytes = await call<ArrayBuffer>(
      settings,
      `/repos/${settings.repo.trim()}/contents/${encodePath(`${assetsPath(settings)}/${name}`)}?ref=${encodeURIComponent(sha)}`,
      { raw: 'bytes' },
    )
    const blob = new Blob([bytes], { type: typeForFileName(name) ?? '' })
    if (await importAssetBlob(blob, imageCodec(), hash)) result.imported += 1
    else result.missing += 1
  }
  return result
}
