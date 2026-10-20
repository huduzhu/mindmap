// @vitest-environment node

import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { importJsonText } from './import'
import * as db from './db'
import { validateDoc } from '../schema/validate'
import { useProjects } from '../store/projects'
import { countNodes, findNode } from '../store/treeOps'
import type { Project, TreeNode } from '../schema/types'
import { resetDatabase } from '../test/resetDb'

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), 'utf8')
const json = (rel: string) => JSON.parse(read(rel)) as Record<string, unknown>
const golden = (name: string) => read(`fixtures/golden/${name}`)

function collectIds(node: TreeNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)]
}

function flatten(node: TreeNode): TreeNode[] {
  return [node, ...(node.children ?? []).flatMap(flatten)]
}

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await resetDatabase()
  await useProjects.getState().init()
})

describe('skill E2E: validate then import each golden workflow output', () => {
  it('generate: template validates and imports as a new project', async () => {
    const text = golden('generate-template.json')
    expect(validateDoc(JSON.parse(text)).ok).toBe(true)

    const result = await importJsonText(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(project.name).toBe('Personal knowledge management')
    expect(project.map.role).toBe('theme')
    expect(project.brainstorm.id).not.toBe('pkm-root')
  })

  it('expand: brainstorm-update merges into the source project, keeping its map verbatim', async () => {
    const packet = json('fixtures/valid/packet-expand.json')
    const packetBrainstorm = (packet.payload as { brainstorm: TreeNode }).brainstorm
    const originalIds = collectIds(packetBrainstorm)
    const originalCount = countNodes(packetBrainstorm)

    const sourceMap: TreeNode = {
      id: 'm-root',
      title: 'Launch ideas',
      children: [{ id: 'm-1', title: 'Prepared branch', role: 'main-branch', side: 'right' }],
    }
    const sourceProject: Project = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Launch ideas',
      preset: 'default',
      brainstorm: structuredClone(packetBrainstorm),
      map: sourceMap,
    }
    await db.putProject({
      id: 'p-launch-1',
      project: sourceProject,
      updatedAt: new Date().toISOString(),
    })

    const text = golden('expand-update.json')
    expect(validateDoc(JSON.parse(text)).ok).toBe(true)

    const result = await importJsonText(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(result.name).toBe('Launch ideas (expanded)')
    expect(project.name).toBe('Launch ideas (expanded)')
    expect(project.preset).toBe(packet.preset)

    const importedIds = collectIds(project.brainstorm)
    for (const id of originalIds) expect(importedIds).toContain(id)
    expect(countNodes(project.brainstorm)).toBeGreaterThan(originalCount)
    const originals = flatten(packetBrainstorm)
    for (const node of originals) {
      const found = findNode(project.brainstorm, node.id)
      expect(found?.node.title).toBe(node.title)
      expect(found?.node.notes).toBe(node.notes)
      const originalChildIds = (node.children ?? []).map((child) => child.id)
      const importedChildIds = (found?.node.children ?? []).map((child) => child.id)
      expect(importedChildIds.filter((id) => originalChildIds.includes(id))).toEqual(
        originalChildIds,
      )
    }

    expect(project.map).toEqual(sourceMap)
    const sourceAfter = await db.getProject('p-launch-1')
    expect(countNodes(sourceAfter!.project.brainstorm)).toBe(originalCount)
    expect(result.notes.some((n) => n.includes('append-only'))).toBe(false)
    expect(result.notes.some((n) => n.includes('no mind map'))).toBe(false)
  })

  it('convert: template map has roles and balanced sides; brainstorm stays pristine', async () => {
    const packet = json('fixtures/valid/packet-convert.json')
    const text = golden('convert-template.json')
    expect(validateDoc(JSON.parse(text)).ok).toBe(true)

    const result = await importJsonText(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const project = useProjects.getState().current!
    expect(project.name).toBe(packet.projectName)
    expect(project.preset).toBe(packet.preset)
    expect(project.map.role).toBe('theme')
    const branches = project.map.children ?? []
    expect(branches.length).toBeGreaterThanOrEqual(2)
    for (const branch of branches) {
      expect(branch.role).toBe('main-branch')
      expect(['left', 'right']).toContain(branch.side)
    }
    const sides = branches.map((b) => b.side)
    expect(new Set(sides).size).toBe(2)
    expect(collectIds(project.brainstorm)).toHaveLength(1)
    expect(project.brainstorm.id).not.toBe(project.map.id)
  })

  it('improve: all node ids from the packet survive in both trees', async () => {
    const packet = json('fixtures/valid/packet-improve.json')
    const payload = packet.payload as { brainstorm: TreeNode; map: TreeNode }
    const originalIds = [...collectIds(payload.brainstorm), ...collectIds(payload.map)]

    const text = golden('improve-project.json')
    expect(validateDoc(JSON.parse(text)).ok).toBe(true)

    const result = await importJsonText(text)
    expect(result.ok).toBe(true)
    const project = useProjects.getState().current!
    expect(project.name).toBe(packet.projectName)
    expect(project.preset).toBe(packet.preset)
    const importedIds = new Set([...collectIds(project.brainstorm), ...collectIds(project.map)])
    for (const id of originalIds) expect(importedIds.has(id)).toBe(true)
    expect(importedIds.size).toBeGreaterThanOrEqual(originalIds.length)
  })
})
