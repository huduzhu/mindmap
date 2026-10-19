// @vitest-environment node

import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { importFileText, importJsonText, importMarkdownText } from './import'
import * as db from './db'
import { useProjects } from '../store/projects'
import { validateDoc } from '../schema/validate'
import type { Project, TreeNode } from '../schema/types'
import { countNodes } from '../store/treeOps'
import { resetDatabase } from '../test/resetDb'

const fixture = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), 'utf8')

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await resetDatabase()
  await useProjects.getState().init()
})

function collectIds(node: TreeNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)]
}

describe('import pipeline', () => {
  it('imports a valid project fixture as a new current project', async () => {
    const result = await importJsonText(fixture('fixtures/valid/project-launch.json'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.name).toBe('Product Launch')
    const state = useProjects.getState()
    expect(state.currentId).toBe(result.projectId)
    expect(state.current?.map.id).toBe('m-root')
    expect(state.current?.brainstorm.children).toHaveLength(3)
  })

  it('importing twice creates two separate copies', async () => {
    const text = fixture('fixtures/valid/project-launch.json')
    const first = await importJsonText(text)
    const second = await importJsonText(text)
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.projectId).not.toBe(second.projectId)
    expect(useProjects.getState().records).toHaveLength(2)
  })

  it('rejects invalid JSON with a clear error', async () => {
    const result = await importJsonText('{ this is not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Invalid JSON/i)
  })

  it('rejects schema-invalid files', async () => {
    const result = await importJsonText(fixture('fixtures/invalid/bad-role.json'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/schema/i)
  })

  it('imports a template as a new project with a fresh brainstorm root', async () => {
    const result = await importJsonText(fixture('fixtures/valid/template-weekly-review.json'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(project.map.id).toBe('t-root')
    expect(project.brainstorm.id).not.toBe('t-root')
    expect(project.preset).toBe('dark')
    expect(result.notes.join(' ')).toMatch(/template/i)
  })

  it('fills missing wrapper fields on a template before validation', async () => {
    const template = JSON.parse(fixture('fixtures/valid/template-weekly-review.json'))
    delete template.schemaVersion
    delete template.name
    delete template.preset

    const result = await importJsonText(JSON.stringify(template))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(result.name).toBe('Weekly Review')
    expect(project.name).toBe('Weekly Review')
    expect(project.schemaVersion).toBe(1)
    expect(project.preset).toBe('default')
  })

  it('fills missing wrapper fields on a project before validation', async () => {
    const project = JSON.parse(fixture('fixtures/valid/project-launch.json'))
    delete project.schemaVersion
    delete project.name
    delete project.preset

    const result = await importJsonText(JSON.stringify(project))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const imported = useProjects.getState().current!
    expect(result.name).toBe('Launch ideas')
    expect(imported.name).toBe('Launch ideas')
    expect(imported.schemaVersion).toBe(1)
    expect(imported.preset).toBe('default')
  })

  it('does not derive a missing kind while filling wrapper fields', async () => {
    const result = await importJsonText(
      JSON.stringify({
        schemaVersion: 1,
        name: 'Missing kind',
        preset: 'default',
        brainstorm: { id: 'b', title: 'Ideas' },
        map: { id: 'm', title: 'Map' },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/unknown or missing kind/i)
  })

  it('still rejects malformed trees after filling wrapper fields', async () => {
    const result = await importJsonText(
      JSON.stringify({
        kind: 'template',
        root: { title: 'Malformed root' },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/schema/i)
      expect(result.error).toMatch(/id/)
    }
  })

  it('falls back to the default preset when the named preset is missing', async () => {
    const text = fixture('fixtures/valid/project-launch.json').replace(
      '"corporate"',
      '"ghost-theme"',
    )
    const result = await importJsonText(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(useProjects.getState().current?.preset).toBe('default')
    expect(result.notes.join(' ')).toMatch(/ghost-theme/)
  })

  it('repairs duplicate node ids', async () => {
    const doc = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Dupes',
      preset: 'default',
      brainstorm: {
        id: 'same',
        title: 'Root',
        children: [
          { id: 'same', title: 'Child one' },
          { id: 'same', title: 'Child two' },
        ],
      },
      map: { id: 'm', title: 'Map' },
    }
    const result = await importJsonText(JSON.stringify(doc))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    const ids = [...collectIds(project.brainstorm), ...collectIds(project.map)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.notes.join(' ')).toMatch(/duplicate/i)
  })

  it('fills empty titles with a placeholder', async () => {
    const doc = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Empty titles',
      preset: 'default',
      brainstorm: {
        id: 'b',
        title: '',
        children: [{ id: 'b1', title: '   ' }],
      },
      map: { id: 'm', title: '' },
    }
    const result = await importJsonText(JSON.stringify(doc))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(project.brainstorm.title).toBe('Untitled')
    expect(project.brainstorm.children![0].title).toBe('Untitled')
    expect(project.map.title).toBe('Untitled')
    expect(result.notes.join(' ')).toMatch(/title/i)
  })

  it('rejects analysis-request packets', async () => {
    const result = await importJsonText(fixture('fixtures/valid/packet-expand.json'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/analysis-request/)
  })

  it('imports markdown bullets into the brainstorm section', async () => {
    const result = await importMarkdownText('# Roadshow\n- Tokyo\n- Osaka\n  - Venue list\n')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(project.name).toBe('Roadshow')
    expect(project.brainstorm.title).toBe('Roadshow')
    expect(project.brainstorm.children).toHaveLength(2)
    expect(project.brainstorm.children![1].children![0].title).toBe('Venue list')
    expect(project.map.title).toBe('Roadshow')
  })

  it('repairs and validates markdown before storing it (#44)', async () => {
    const long = 'x'.repeat(5000)
    const result = await importMarkdownText(`# ${'H'.repeat(300)}\n- ${long}\n`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.notes.join(' ')).toMatch(/Shortened 1 title/)
    const project = useProjects.getState().current!
    expect(project.name.length).toBeLessThanOrEqual(200)
    expect(project.brainstorm.children![0].title.length).toBeLessThanOrEqual(500)
    expect(validateDoc(project).ok).toBe(true)

    // The project's own JSON export must re-import.
    const reimport = await importJsonText(JSON.stringify(project))
    expect(reimport.ok).toBe(true)
  })

  it('refuses trees deeper than MAX_TREE_DEPTH with a clear message (#65)', async () => {
    // Built as text: stringifying a deep object recurses in some engines.
    const depth = 5000
    const open = Array.from(
      { length: depth },
      (_, i) => `{"id":"n${i}","title":"t","children":[`,
    ).join('')
    const root = `${open}{"id":"leaf","title":"leaf"}${']}'.repeat(depth)}`
    const json = `{"kind":"template","schemaVersion":1,"name":"Deep","preset":"default","root":${root}}`
    const result = await importJsonText(json)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/nested 5001 levels deep/)

    const md = [
      '# Deep',
      ...Array.from({ length: 1200 }, (_, i) => `${'  '.repeat(i)}- level ${i}`),
    ].join('\n')
    const mdResult = await importMarkdownText(md)
    expect(mdResult.ok).toBe(false)
  })

  it('rejects markdown without bullets', async () => {
    const result = await importMarkdownText('# Nothing here\njust prose\n')
    expect(result.ok).toBe(false)
  })

  it('routes files by extension through importFileText', async () => {
    const md = await importFileText('notes.md', '# T\n- a\n')
    expect(md.ok).toBe(true)
    const json = await importFileText('project.json', fixture('fixtures/valid/project-launch.json'))
    expect(json.ok).toBe(true)
  })
})

describe('brainstorm-update imports', () => {
  async function seedSource(map: TreeNode): Promise<void> {
    const project: Project = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Source',
      preset: 'default',
      brainstorm: { id: 'b', title: 'Source', children: [{ id: 'c1', title: 'Existing idea' }] },
      map,
    }
    await db.putProject({ id: 'p-src', project, updatedAt: new Date().toISOString() })
  }

  const updateDoc = (brainstorm: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      kind: 'brainstorm-update',
      schemaVersion: 1,
      sourceProjectId: 'p-src',
      name: 'Source',
      preset: 'default',
      brainstorm,
      ...extra,
    })

  it('imports as a new project when the source project does not exist', async () => {
    const result = await importJsonText(
      updateDoc(
        { id: 'b', title: 'New ideas', children: [{ id: 'x-1', title: 'New idea' }] },
        { name: 'Imported ideas', preset: 'default' },
      ),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(result.name).toBe('Imported ideas')
    expect(project.name).toBe('Imported ideas')
    expect(project.preset).toBe('default')
    expect(project.brainstorm.title).toBe('New ideas')
    expect(project.map.title).toBe('New ideas')
  })

  it('notes the missing source and points to the convert workflow', async () => {
    const result = await importJsonText(
      JSON.stringify({
        kind: 'brainstorm-update',
        sourceProjectId: 'p-src',
        brainstorm: { id: 'b', title: 'Source' },
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.notes.join(' ')).toMatch(/no project with id "p-src"/i)
    expect(result.notes.join(' ')).toMatch(/convert workflow/i)
  })

  it('puts an expanded branch back in place, keeping the rest of the brainstorm (#146)', async () => {
    const project: Project = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Source',
      preset: 'default',
      brainstorm: {
        id: 'b',
        title: 'Source',
        children: [
          { id: 'c1', title: 'Existing idea', children: [{ id: 'c1a', title: 'Inside' }] },
          { id: 'c2', title: 'Untouched' },
        ],
      },
      map: { id: 'm', title: 'Source map' },
    }
    await db.putProject({ id: 'p-src', project, updatedAt: new Date().toISOString() })
    const result = await importJsonText(
      updateDoc({
        id: 'c1',
        title: 'Existing idea',
        children: [
          { id: 'c1a', title: 'Inside' },
          { id: 'x-1', title: 'New idea' },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.notes.join(' ')).not.toMatch(/removed/i)
    const brainstorm = useProjects.getState().current!.brainstorm
    expect(brainstorm.id).toBe('b')
    expect(brainstorm.children!.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(brainstorm.children![0].children!.map((c) => c.id)).toEqual(['c1a', 'x-1'])
  })

  it('rejects an update document that carries a map', async () => {
    await seedSource({ id: 'm', title: 'Source map' })
    const result = await importJsonText(
      updateDoc(
        { id: 'b', title: 'Source', children: [{ id: 'x-1', title: 'New idea' }] },
        { map: { id: 'x-map', title: 'Not allowed' } },
      ),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/schema/i)
  })

  it('imports a violating update but reports the append-only breach', async () => {
    await seedSource({ id: 'm', title: 'Source map', children: [{ id: 'm1', title: 'Branch' }] })
    const result = await importJsonText(
      updateDoc({
        id: 'b',
        title: 'Renamed root',
        children: [{ id: 'x-1', title: 'Replacement idea' }],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(project.name).toBe('Source (expanded)')
    expect(project.brainstorm.title).toBe('Renamed root')
    const note = result.notes.find((n) => n.includes('append-only'))
    expect(note).toMatch(/1 removed/)
    expect(note).toMatch(/1 renamed/)
  })

  it('notes when the source project still has no mind map', async () => {
    await seedSource({ id: 'm', title: 'Source map' })
    const result = await importJsonText(
      updateDoc({
        id: 'b',
        title: 'Source',
        children: [
          { id: 'c1', title: 'Existing idea' },
          { id: 'x-1', title: 'New idea' },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.notes.join(' ')).toMatch(/no mind map/)
  })
})

describe('expand imports: merge, new project or cancel (#84)', () => {
  async function seedSource(): Promise<void> {
    const project: Project = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Source',
      preset: 'default',
      brainstorm: { id: 'b', title: 'Source', children: [{ id: 'c1', title: 'Existing idea' }] },
      map: { id: 'm', title: 'Source map', children: [{ id: 'm1', title: 'Branch' }] },
    }
    await db.putProject({ id: 'p-src', project, updatedAt: new Date().toISOString() })
    await useProjects.getState().init()
  }

  const expanded = JSON.stringify({
    kind: 'brainstorm-update',
    schemaVersion: 1,
    sourceProjectId: 'p-src',
    name: 'Source',
    preset: 'default',
    brainstorm: {
      id: 'b',
      title: 'Source',
      children: [
        { id: 'c1', title: 'Existing idea', children: [{ id: 'x-2', title: 'Detail' }] },
        { id: 'x-1', title: 'New idea' },
      ],
    },
  })

  it('previews what the file adds before asking', async () => {
    await seedSource()
    const previews: unknown[] = []
    await importJsonText(expanded, {
      chooseExpandAction: async (preview) => {
        previews.push(preview)
        return null
      },
    })
    expect(previews).toEqual([{ sourceName: 'Source', added: 2, changed: 0, removed: 0, moved: 0 }])
  })

  it('merge updates the source project’s brainstorm, keeps its map, and undoes in one step', async () => {
    await seedSource()
    const before = (await db.getProject('p-src'))!.project
    const result = await importJsonText(expanded, { chooseExpandAction: async () => 'merge' })
    expect(result).toMatchObject({ ok: true, merged: true, projectId: 'p-src', name: 'Source' })

    const state = useProjects.getState()
    expect(state.currentId).toBe('p-src')
    expect(state.records).toHaveLength(1)
    expect(state.current!.brainstorm.children!.map((c) => c.title)).toEqual([
      'Existing idea',
      'New idea',
    ])
    expect(state.current!.map).toEqual(before.map)

    const { useEditor } = await import('../store/editor')
    useEditor.getState().undo()
    expect(useProjects.getState().current!.brainstorm).toEqual(before.brainstorm)
  })

  it('merge never reuses an id the map already has', async () => {
    await seedSource()
    const clash = JSON.stringify({
      ...JSON.parse(expanded),
      brainstorm: {
        id: 'b',
        title: 'Source',
        children: [
          { id: 'c1', title: 'Existing idea' },
          { id: 'm1', title: 'Clashes with a map id' },
        ],
      },
    })
    const result = await importJsonText(clash, { chooseExpandAction: async () => 'merge' })
    expect(result.ok).toBe(true)
    const project = useProjects.getState().current!
    const brainstormIds = collectIds(project.brainstorm)
    for (const id of collectIds(project.map)) expect(brainstormIds).not.toContain(id)
  })

  it('"new project" keeps the source and adds an (expanded) copy', async () => {
    await seedSource()
    const result = await importJsonText(expanded, { chooseExpandAction: async () => 'new' })
    expect(result).toMatchObject({ ok: true, name: 'Source (expanded)' })
    expect(result.ok && result.merged).toBeFalsy()
    expect(useProjects.getState().records).toHaveLength(2)
    expect((await db.getProject('p-src'))!.project.brainstorm.children).toHaveLength(1)
  })

  it('cancel changes nothing', async () => {
    await seedSource()
    const result = await importJsonText(expanded, { chooseExpandAction: async () => null })
    expect(result).toMatchObject({ ok: false, cancelled: true })
    expect(useProjects.getState().records).toHaveLength(1)
    expect((await db.getProject('p-src'))!.project.brainstorm.children).toHaveLength(1)
  })
})

describe('AI convert / improve replies apply to their source project', () => {
  const brainstorm: TreeNode = {
    id: 'b',
    title: 'Ideas',
    children: [
      { id: 'b1', title: 'One' },
      { id: 'b2', title: 'Two' },
    ],
  }
  async function seedSource(map: TreeNode = { id: 'm', title: 'Ideas' }): Promise<void> {
    const project: Project = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Source',
      preset: 'default',
      tags: ['keep'],
      brainstorm,
      map,
    }
    await db.putProject({ id: 'p-src', project, updatedAt: new Date().toISOString() })
    await useProjects.getState().init()
  }

  const convertReply = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      kind: 'template',
      schemaVersion: 1,
      sourceProjectId: 'p-src',
      name: 'Source',
      preset: 'default',
      root: {
        id: 'r',
        title: 'Ideas',
        role: 'theme',
        children: [
          { id: 'x1', title: 'Group A', role: 'main-branch', side: 'right' },
          // Clashes with a brainstorm id: must be reassigned, ids are project-wide.
          { id: 'b1', title: 'Group B', role: 'main-branch', side: 'left' },
        ],
      },
      ...extra,
    })

  it('previews the new map and, applied, fills the source map and keeps the brainstorm', async () => {
    await seedSource()
    const previews: unknown[] = []
    const result = await importJsonText(convertReply(), {
      chooseApplyAction: async (preview) => {
        previews.push(preview)
        return 'apply'
      },
    })
    expect(previews).toEqual([
      { intent: 'convert', sourceName: 'Source', mapNodes: 2, currentMapNodes: 0 },
    ])
    expect(result).toMatchObject({ ok: true, applied: 'map', projectId: 'p-src', name: 'Source' })
    const state = useProjects.getState()
    expect(state.records).toHaveLength(1)
    expect(state.currentId).toBe('p-src')
    const project = state.current!
    expect(project.map.children!.map((c) => c.title)).toEqual(['Group A', 'Group B'])
    expect(project.brainstorm).toEqual(brainstorm)
    expect(project.tags).toEqual(['keep'])
    const brainstormIds = collectIds(project.brainstorm)
    for (const id of collectIds(project.map)) expect(brainstormIds).not.toContain(id)
    expect(validateDoc(project).ok).toBe(true)

    const { useEditor } = await import('../store/editor')
    expect(useEditor.getState().view).toBe('map')
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map).toEqual({ id: 'm', title: 'Ideas' })
  })

  it('"new project" keeps the source and adds a separate one; cancel changes nothing', async () => {
    await seedSource()
    const cancelled = await importJsonText(convertReply(), { chooseApplyAction: async () => null })
    expect(cancelled).toMatchObject({ ok: false, cancelled: true })
    expect(useProjects.getState().records).toHaveLength(1)

    const separate = await importJsonText(convertReply(), { chooseApplyAction: async () => 'new' })
    expect(separate.ok && separate.applied).toBeFalsy()
    expect(useProjects.getState().records).toHaveLength(2)
    expect((await db.getProject('p-src'))!.project.map.children).toBeUndefined()
  })

  it('an unknown source id imports a separate project and says why', async () => {
    const result = await importJsonText(convertReply({ sourceProjectId: 'p-gone' }), {
      chooseApplyAction: async () => 'apply',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.applied).toBeUndefined()
    expect(result.notes.join(' ')).toContain('"p-gone", which is not in this library')
  })

  it('an improve reply updates both trees as one undo step, and is never stored with the id', async () => {
    await seedSource({ id: 'm', title: 'Ideas', children: [{ id: 'm1', title: 'Old branch' }] })
    const improved = JSON.stringify({
      kind: 'project',
      schemaVersion: 1,
      sourceProjectId: 'p-src',
      name: 'Source',
      preset: 'default',
      brainstorm: { ...brainstorm, children: [{ id: 'b1', title: 'One, sharper' }] },
      map: { id: 'm', title: 'Ideas', children: [{ id: 'm1', title: 'Better branch' }] },
    })
    const result = await importJsonText(improved, { chooseApplyAction: async () => 'apply' })
    expect(result).toMatchObject({ ok: true, applied: 'project' })
    const project = useProjects.getState().current!
    expect(project.map.children![0].title).toBe('Better branch')
    expect(project.brainstorm.children![0].title).toBe('One, sharper')
    expect('sourceProjectId' in project).toBe(false)

    const { useEditor } = await import('../store/editor')
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.children![0].title).toBe('Old branch')
    expect(useProjects.getState().current!.brainstorm).toEqual(brainstorm)

    const copy = await importJsonText(improved, { chooseApplyAction: async () => 'new' })
    expect(copy.ok).toBe(true)
    const stored = (await db.listProjects()).find((r) => r.id !== 'p-src')!
    expect('sourceProjectId' in stored.project).toBe(false)
  })
})

describe('export -> import round trip', () => {
  it('an exported project re-imports as an identical copy', async () => {
    await useProjects.getState().createProject('Round trip')
    useProjects
      .getState()
      .updateCurrent((project) => ({ ...project, pinned: true, tags: ['Planning', 'Team'] }))
    await useProjects.getState().saveCurrent()
    const original = useProjects.getState().current!
    const exported = JSON.stringify(original)

    const result = await importJsonText(exported)
    expect(result.ok).toBe(true)
    const copy = useProjects.getState().current!
    expect(copy.name).toBe(original.name)
    expect(copy.map).toEqual(original.map)
    expect(copy.brainstorm).toEqual(original.brainstorm)
    expect(copy.pinned).toBe(true)
    expect(copy.tags).toEqual(['Planning', 'Team'])
    expect(countNodes(copy.map)).toBe(countNodes(original.map))
  })
})

describe('readBranch (#102)', () => {
  it('reads a Markdown outline as one branch, titled by its heading or file name', async () => {
    const { readBranch } = await import('./import')
    const withHeading = readBranch('notes.md', '# Trip\n- Flights\n  - Seats\n- Hotel', null)!
    expect(withHeading.title).toBe('Trip')
    expect(withHeading.count).toBe(4)
    expect(withHeading.payload.nodes[0].children!.map((n) => n.title)).toEqual(['Flights', 'Hotel'])
    expect(readBranch('packing list.txt', '- Socks\n- Hat', null)!.title).toBe('packing list')
    expect(readBranch('empty.md', 'Just prose, no bullets.', null)).toBeNull()
  })

  it('reads a project’s map with its links, and a template’s root', async () => {
    const { readBranch } = await import('./import')
    const project = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Other',
      preset: 'default',
      brainstorm: { id: 'b', title: 'B' },
      map: {
        id: 'm',
        title: 'Other map',
        children: [
          { id: 'x', title: 'X' },
          { id: 'y', title: 'Y' },
        ],
      },
      links: [{ from: 'x', to: 'y' }],
    }
    const branch = readBranch('other.json', JSON.stringify(project), null)!
    expect(branch.title).toBe('Other map')
    expect(branch.count).toBe(3)
    expect(branch.payload.links).toEqual([{ from: 'x', to: 'y' }])
    const template = {
      kind: 'template',
      schemaVersion: 1,
      name: 'T',
      preset: 'default',
      root: { id: 'r', title: 'Agenda' },
    }
    expect(readBranch('t.json', JSON.stringify(template), null)!.title).toBe('Agenda')
  })

  it('leaves AI replies for the open project, expand files and invalid files to the usual import', async () => {
    const { readBranch } = await import('./import')
    const reply = {
      kind: 'template',
      schemaVersion: 1,
      sourceProjectId: 'open-one',
      name: 'T',
      preset: 'default',
      root: { id: 'r', title: 'Agenda' },
    }
    expect(readBranch('reply.json', JSON.stringify(reply), 'open-one')).toBeNull()
    expect(readBranch('reply.json', JSON.stringify(reply), 'another')).not.toBeNull()
    const update = {
      kind: 'brainstorm-update',
      schemaVersion: 1,
      sourceProjectId: 's',
      name: 'N',
      preset: 'default',
      brainstorm: { id: 'b', title: 'B' },
    }
    expect(readBranch('u.json', JSON.stringify(update), null)).toBeNull()
    expect(readBranch('bad.json', '{nope', null)).toBeNull()
    expect(readBranch('bad.json', JSON.stringify({ kind: 'project' }), null)).toBeNull()
  })
})

describe('files from a newer app version (GE0a)', () => {
  it('says the file needs a newer version instead of listing unknown fields', async () => {
    const doc = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Future',
      preset: 'default',
      brainstorm: { id: 'b', title: 'B' },
      map: { id: 'm', title: 'M', progressRing: true },
    }
    const result = await importJsonText(JSON.stringify(doc))
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toMatch(/newer version/)
    expect(useProjects.getState().records).toHaveLength(0)
  })

  it('opens a current file that carries an app block, without keeping the block', async () => {
    const doc = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Now',
      preset: 'default',
      brainstorm: { id: 'b', title: 'B' },
      map: { id: 'm', title: 'M' },
      app: { minVersion: 1 },
    }
    const result = await importJsonText(JSON.stringify(doc))
    expect(result.ok).toBe(true)
    expect(useProjects.getState().current).not.toHaveProperty('app')
  })
})
