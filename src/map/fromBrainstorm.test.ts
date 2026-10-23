import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../schema/types'
import { makeTree as t } from '../test/fixtures'
import {
  appendBrainstormToMap,
  brainstormToBranches,
  countBullets,
  replaceMapWithBrainstorm,
} from './fromBrainstorm'
import { validateDoc } from '../schema/validate'

const brainstorm = (): TreeNode =>
  t('b', 'Ideas', [
    t('b1', 'Offline sync', [t('b1a', 'Conflict copies')], { notes: 'Must work on planes' }),
    t('b2', 'Sharing'),
    t('b3', 'Speed', [], { collapsed: true }),
  ])

const ids = (node: TreeNode): string[] => [node.id, ...(node.children ?? []).flatMap(ids)]

describe('brainstorm → map (#87)', () => {
  it('turns top-level bullets into main branches, keeping order, depth and notes', () => {
    const branches = brainstormToBranches(brainstorm())
    expect(branches.map((b) => b.title)).toEqual(['Offline sync', 'Sharing', 'Speed'])
    expect(branches.every((b) => b.role === 'main-branch')).toBe(true)
    expect(branches[0].notes).toBe('Must work on planes')
    expect(branches[0].children?.map((c) => c.title)).toEqual(['Conflict copies'])
    expect(branches[0].children?.[0].role).toBeUndefined()
    // Folding and sides are the map's business: the layout alternates sides.
    expect(branches[2].collapsed).toBeUndefined()
    expect(branches.some((b) => b.side)).toBe(false)
  })

  it('carries tags and pictures, as copies', () => {
    const image = { asset: `sha256-${'b'.repeat(64)}`, w: 20, h: 10, alt: 'Plane' }
    const source = t('b', 'Ideas', [
      t('b1', 'Offline sync', [t('b1a', 'Conflict copies', [], { tags: ['later'] })], {
        tags: ['p1', 'sync'],
        image,
      }),
    ])
    const [branch] = brainstormToBranches(source)
    expect(branch.tags).toEqual(['p1', 'sync'])
    expect(branch.image).toEqual(image)
    expect(branch.children?.[0].tags).toEqual(['later'])
    expect(branch.tags).not.toBe(source.children![0].tags)
    expect(branch.image).not.toBe(image)
    expect(branch.children?.[0].image).toBeUndefined()
  })

  it('uses fresh ids so the two trees never share a node', () => {
    const source = brainstorm()
    const branches = brainstormToBranches(source)
    const used = new Set(ids(source))
    for (const id of branches.flatMap(ids)) expect(used.has(id)).toBe(false)
    expect(new Set(branches.flatMap(ids)).size).toBe(4)
  })

  it('appends under the root or replaces the branches, keeping the root', () => {
    const map = t('m', 'Plan', [t('m1', 'Existing')], { notes: 'root notes', collapsed: true })
    const appended = appendBrainstormToMap(map, brainstorm())
    expect(appended.children?.map((c) => c.title)).toEqual([
      'Existing',
      'Offline sync',
      'Sharing',
      'Speed',
    ])
    const replaced = replaceMapWithBrainstorm(map, brainstorm())
    expect(replaced.id).toBe('m')
    expect(replaced.notes).toBe('root notes')
    expect('collapsed' in replaced).toBe(false)
    expect(replaced.children?.map((c) => c.title)).toEqual(['Offline sync', 'Sharing', 'Speed'])
    expect(
      validateDoc({
        kind: 'project',
        schemaVersion: 1,
        name: 'x',
        preset: 'default',
        brainstorm: brainstorm(),
        map: replaced,
      }).ok,
    ).toBe(true)
  })

  it('counts bullets and leaves the map alone for an empty brainstorm', () => {
    expect(countBullets(brainstorm())).toBe(4)
    const map = t('m', 'Plan')
    expect(appendBrainstormToMap(map, t('b', 'Ideas'))).toBe(map)
  })
})
