import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProjectRecord } from '../io/db'
import { makeProject } from '../test/fixtures'
import {
  checkRepo,
  encodePath,
  GitHubError,
  isValidFolder,
  isValidRepo,
  normalizeFolder,
  isValidTag,
  listMilestones,
  projectPath,
  readMilestone,
  saveMilestone,
  type GitHubSettings,
} from './github'
import { projectFileText } from './engine'
import type { Project } from '../schema/types'
import { setImageCodec } from '../assets/codec'
import { blobBytes, getAsset, hasAsset, putAsset } from '../assets/store'
import { simpleCodec, storeTestImage } from '../test/fakeCodec'
import { resetDatabase } from '../test/resetDb'
import { fetchMilestoneImages, MAX_MILESTONE_IMAGE_BYTES } from './github'

type Call = {
  url: string
  method: string
  body?: Record<string, unknown>
  auth: string | null
  accept: string | null
}
let calls: Call[] = []
let routes: Record<string, (call: Call) => { status: number; body: unknown }> = {}
const realFetch = globalThis.fetch

beforeEach(() => {
  calls = []
  routes = {}
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call: Call = {
      url: String(input).replace('https://api.github.com', ''),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get('Authorization'),
      accept: new Headers(init?.headers).get('Accept'),
    }
    calls.push(call)
    const key = Object.keys(routes).find((prefix) =>
      `${call.method} ${call.url}`.startsWith(prefix),
    )
    const { status, body } = key
      ? routes[key](call)
      : { status: 404, body: { message: 'Not Found' } }
    const payload =
      typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)
    return new Response(payload as BodyInit, { status })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const settings: GitHubSettings = { repo: 'someone/maps', token: ' t0ken ', folder: 'mindmaps' }
const record: ProjectRecord = {
  id: 'AAAAAAAAAA',
  project: { ...makeProject('厨房 Kitchen'), updatedAt: '2026-10-04T00:00:00.000Z' },
  updatedAt: '2026-10-04T00:00:00.000Z',
}
const privateRepo = () => ({ status: 200, body: { private: true, default_branch: 'main' } })

describe('GitHub milestones (#112b)', () => {
  it('validates repository names and tags', () => {
    expect(isValidRepo('someone/maps')).toBe(true)
    expect(isValidRepo('maps')).toBe(false)
    expect(isValidTag('v1.0')).toBe(true)
    expect(isValidTag('quotes/smith-2026')).toBe(true)
    for (const bad of ['v1..0', 'a b', 'x.lock', '-x', 'x.', 'a//b'])
      expect(isValidTag(bad)).toBe(false)
  })

  it('names files by project id inside the folder', () => {
    expect(projectPath(settings, 'AAAAAAAAAA')).toBe('mindmaps/AAAAAAAAAA.mindmap.json')
    expect(projectPath({ ...settings, folder: '/' }, 'AAAAAAAAAA')).toBe('AAAAAAAAAA.mindmap.json')
  })

  it('normalises the folder and refuses unsafe ones', () => {
    expect(normalizeFolder(' /maps//2026/ ')).toBe('maps/2026')
    expect(normalizeFolder('/')).toBe('')
    expect(normalizeFolder('Mind maps/思维导图')).toBe('Mind maps/思维导图')
    for (const bad of ['..', 'a/../b', './a', 'a?b', 'a#b', 'a\\b', 'a\u0000b', 'a\nb', 'a\u007fb'])
      expect(isValidFolder(bad)).toBe(false)
    expect(() => projectPath({ ...settings, folder: '../other' }, 'AAAAAAAAAA')).toThrow(
      GitHubError,
    )
    expect(isValidRepo('../maps')).toBe(false)
    expect(isValidRepo('someone/..')).toBe(false)
  })

  it('encodes each path segment for the API URL', async () => {
    expect(encodePath('Mind maps/a%2Fb/c#d?.json')).toBe('Mind%20maps/a%252Fb/c%23d%3F.json')
    routes['GET /repos/someone/maps'] = privateRepo
    routes['GET /repos/someone/maps/contents'] = () => ({ status: 404, body: {} })
    routes['PUT /repos/someone/maps/contents/'] = () => ({
      status: 201,
      body: { commit: { sha: 'c0ffee1234' } },
    })
    await saveMilestone({ ...settings, folder: 'Mind maps/100%' }, record, 'm')
    expect(calls.find((c) => c.method === 'PUT')!.url).toBe(
      '/repos/someone/maps/contents/Mind%20maps/100%25/AAAAAAAAAA.mindmap.json',
    )
  })

  it('refuses public repositories', async () => {
    routes['GET /repos/someone/maps'] = () => ({
      status: 200,
      body: { private: false, default_branch: 'main' },
    })
    await expect(checkRepo(settings)).rejects.toMatchObject({ code: 'public' })
  })

  it('maps GitHub errors', async () => {
    routes['GET /repos/someone/maps'] = () => ({
      status: 401,
      body: { message: 'Bad credentials' },
    })
    await expect(checkRepo(settings)).rejects.toBeInstanceOf(GitHubError)
    await expect(checkRepo(settings)).rejects.toMatchObject({ code: 'token' })
  })

  it('creates the file on the first milestone, updates it with its sha later, and tags', async () => {
    routes['GET /repos/someone/maps/contents'] = () => ({
      status: 404,
      body: { message: 'Not Found' },
    })
    routes['GET /repos/someone/maps'] = privateRepo
    routes['PUT /repos/someone/maps/contents/mindmaps/AAAAAAAAAA.mindmap.json'] = () => ({
      status: 201,
      body: { commit: { sha: 'c0ffee1234' } },
    })
    routes['POST /repos/someone/maps/git/refs'] = () => ({ status: 201, body: {} })
    expect(await saveMilestone(settings, record, 'First draft', 'v1.0')).toEqual({
      sha: 'c0ffee1234',
      images: 0,
      imagesSkipped: 0,
    })
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.auth).toBe('Bearer t0ken')
    expect(put.body).toMatchObject({ message: 'First draft', branch: 'main' })
    expect(put.body!.sha).toBeUndefined()
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(String(put.body!.content)), (c) => c.charCodeAt(0)),
    )
    expect(decoded).toBe(projectFileText(record))
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      ref: 'refs/tags/v1.0',
      sha: 'c0ffee1234',
    })

    routes['GET /repos/someone/maps/contents'] = () => ({ status: 200, body: { sha: 'blob1' } })
    calls = []
    await saveMilestone(settings, record, 'Second')
    expect(calls.find((c) => c.method === 'PUT')!.body!.sha).toBe('blob1')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('lists milestones and reads one back as a project', async () => {
    routes['GET /repos/someone/maps/commits'] = () => ({
      status: 200,
      body: [
        {
          sha: 'abc1234567',
          commit: { message: 'First draft', author: { date: '2026-10-04T01:00:00Z' } },
        },
      ],
    })
    // Raw content, as GitHub sends it for files of any size (#122); the JSON
    // form has no content over 1 MB.
    routes['GET /repos/someone/maps/contents'] = (call) =>
      call.accept === 'application/vnd.github.raw+json'
        ? { status: 200, body: projectFileText(record) }
        : { status: 200, body: { encoding: 'none', content: '' } }
    routes['GET /repos/someone/maps'] = privateRepo
    const list = await listMilestones(settings, 'AAAAAAAAAA')
    expect(list).toEqual([
      { sha: 'abc1234567', message: 'First draft', date: '2026-10-04T01:00:00Z' },
    ])
    expect(calls.at(-1)!.url).toContain('path=mindmaps%2FAAAAAAAAAA.mindmap.json&sha=main')
    const parsed = await readMilestone(settings, 'AAAAAAAAAA', 'abc1234567')
    expect(parsed.ok && parsed.project.name).toBe('厨房 Kitchen')
  })
})

describe('images in GitHub milestones (#149, HC-D5)', () => {
  const photoRecord = (...assets: string[]): ProjectRecord => {
    const base = makeProject('Photos')
    const project: Project = {
      ...base,
      map: {
        ...base.map,
        children: assets.map((asset, i) => ({
          id: `p${i}`,
          title: `Photo ${i}`,
          image: { asset, w: 100, h: 50 },
        })),
      },
    }
    return { id: 'PHOTOSPROJ', project, updatedAt: '2026-10-04T00:00:00.000Z' }
  }
  const decode = (content: unknown) =>
    Uint8Array.from(atob(String(content)), (c) => c.charCodeAt(0))

  beforeEach(async () => {
    await resetDatabase()
    setImageCodec(simpleCodec())
    routes['GET /repos/someone/maps/contents/mindmaps/PHOTOSPROJ'] = () => ({
      status: 404,
      body: {},
    })
    routes['PUT /repos/someone/maps/contents/mindmaps/PHOTOSPROJ'] = () => ({
      status: 201,
      body: { commit: { sha: 'milestone1' } },
    })
    routes['PUT /repos/someone/maps/contents/mindmaps/assets/'] = () => ({
      status: 201,
      body: { commit: { sha: 'image' } },
    })
  })
  afterEach(() => setImageCodec(null))

  it('commits the images the repository lacks before the project, each once', async () => {
    const there = await storeTestImage('there')
    const fresh = await storeTestImage('fresh', 'image/png')
    routes['GET /repos/someone/maps/contents/mindmaps/assets'] = () => ({
      status: 200,
      body: [
        { name: `${there.hash}.webp`, type: 'file' },
        { name: 'README.md', type: 'file' },
      ],
    })
    routes['GET /repos/someone/maps'] = privateRepo
    const result = await saveMilestone(settings, photoRecord(there.hash, fresh.hash), 'Quote')
    expect(result).toEqual({ sha: 'milestone1', images: 1, imagesSkipped: 0 })
    const puts = calls.filter((c) => c.method === 'PUT')
    expect(puts.map((c) => c.url)).toEqual([
      `/repos/someone/maps/contents/mindmaps/assets/${fresh.hash}.png`,
      '/repos/someone/maps/contents/mindmaps/PHOTOSPROJ.mindmap.json',
    ])
    expect(puts[0].body).toMatchObject({ message: 'Quote (image)', branch: 'main' })
    const stored = new Uint8Array(await blobBytes((await getAsset(fresh.hash))!))
    expect(Array.from(decode(puts[0].body!.content))).toEqual(Array.from(stored))
  })

  it('commits only the project when the new images come to more than 10 MB', async () => {
    const big = await putAsset(
      new Blob([new Uint8Array(MAX_MILESTONE_IMAGE_BYTES + 1).fill(9)], { type: 'image/webp' }),
      {
        w: 100,
        h: 50,
        thumb: new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      },
    )
    routes['GET /repos/someone/maps/contents/mindmaps/assets'] = () => ({ status: 404, body: {} })
    routes['GET /repos/someone/maps'] = privateRepo
    const result = await saveMilestone(settings, photoRecord(big.hash), 'Big')
    expect(result).toEqual({ sha: 'milestone1', images: 0, imagesSkipped: 1 })
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
  })

  it('fetches a restored milestone’s missing images as they were at that commit', async () => {
    const meta = await storeTestImage('remote')
    const bytes = new Uint8Array(await blobBytes((await getAsset(meta.hash))!))
    const wrong = `sha256-${'e'.repeat(64)}`
    await resetDatabase()
    routes['GET /repos/someone/maps/contents/mindmaps/assets?'] = () => ({
      status: 200,
      body: [
        { name: `${meta.hash}.webp`, type: 'file' },
        { name: `${wrong}.webp`, type: 'file' },
      ],
    })
    routes[`GET /repos/someone/maps/contents/mindmaps/assets/${meta.hash}.webp`] = () => ({
      status: 200,
      body: bytes,
    })
    routes[`GET /repos/someone/maps/contents/mindmaps/assets/${wrong}.webp`] = () => ({
      status: 200,
      body: new TextEncoder().encode('not those bytes'),
    })
    const absent = `sha256-${'f'.repeat(64)}`
    const project = photoRecord(meta.hash, wrong, absent).project
    expect(await fetchMilestoneImages(settings, project, 'abc1234567')).toEqual({
      imported: 1,
      missing: 2,
    })
    expect(await hasAsset(meta.hash)).toBe(true)
    expect(await hasAsset(wrong)).toBe(false)
    const raw = calls.find((c) => c.url.includes(`${meta.hash}.webp`))!
    expect(raw.accept).toBe('application/vnd.github.raw+json')
    expect(raw.url).toContain('ref=abc1234567')
    expect(calls[0].url).toBe('/repos/someone/maps/contents/mindmaps/assets?ref=abc1234567')
  })
})
