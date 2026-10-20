import { describe, expect, it } from 'vitest'
import { makePreset, makeProject, makeTree } from '../test/fixtures'
import { cleanImage, thumbSize } from './image'
import { layoutGeometry, nodeSize, IMAGE_GAP } from './layout'
import { dropInvalidMarks, emptyRepairStats, repairTree } from '../io/sanitize'
import { FORMAT_VERSION, projectForFile, requiredFormatVersion } from '../schema/formatVersion'
import { validateDoc } from '../schema/validate'
import { describeTreeChange, nodeAccessibleName } from '../a11y/describe'
import { estimateTextWidth } from './measure'
import type { NodeImage } from '../schema/types'
import { setNodeImage } from '../assets/attach'

const HASH = `sha256-${'ab'.repeat(32)}`
const image = (extra: Partial<NodeImage> = {}): NodeImage => ({
  asset: HASH,
  w: 800,
  h: 600,
  ...extra,
})

describe('node image data (#149, HC1)', () => {
  it('the schema takes a clean image and refuses unusable ones', () => {
    const ok = makeProject(
      'P',
      undefined,
      makeTree('m', 'Root', [], { image: image({ alt: 'x' }) }),
    )
    expect(validateDoc(ok).ok).toBe(true)
    for (const bad of [
      { asset: 'sha256-xyz', w: 1, h: 1 },
      { asset: HASH, w: 0, h: 10 },
      { asset: HASH, w: 1601, h: 10 },
      { asset: HASH, w: 10.5, h: 10 },
      { asset: HASH, w: 10, h: 10, alt: 'x'.repeat(301) },
      { asset: HASH, w: 10, h: 10, src: 'data:' },
      { asset: HASH, w: 10 },
    ]) {
      const doc = makeProject(
        'P',
        undefined,
        makeTree('m', 'Root', [], { image: bad as NodeImage }),
      )
      expect(validateDoc(doc).ok).toBe(false)
    }
  })

  it('sanitising drops an unusable image instead of refusing the project', () => {
    const doc = makeProject(
      'P',
      makeTree('b', 'B', [makeTree('i', 'I', [], { image: { asset: 'nope' } as NodeImage })]),
      makeTree('m', 'Root', [
        makeTree('a', 'A', [], {
          image: { asset: HASH, w: 10, h: 20, alt: `  ${'y'.repeat(400)} `, extra: 1 } as never,
        }),
        makeTree('c', 'C', [], { image: image() }),
      ]),
    )
    const clean = dropInvalidMarks(doc)
    expect(clean.brainstorm.children![0]).not.toHaveProperty('image')
    expect(clean.map.children![0].image).toEqual({
      asset: HASH,
      w: 10,
      h: 20,
      alt: 'y'.repeat(300),
    })
    // A clean node keeps its object.
    expect(clean.map.children![1]).toBe(doc.map.children![1])
    expect(validateDoc(clean).ok).toBe(true)
    const repaired = repairTree(
      makeTree('r', 'R', [], { image: 'x' as never }),
      new Set(),
      emptyRepairStats(),
    )
    expect(repaired).not.toHaveProperty('image')
    expect(cleanImage({ asset: HASH, w: 3, h: 4, alt: '   ' })).toEqual({ asset: HASH, w: 3, h: 4 })
  })

  it('needs format 4 only when a node has an image; other files keep their bytes', () => {
    expect(FORMAT_VERSION).toBe(4)
    const plain = makeProject('P', undefined, makeTree('m', 'Root', [makeTree('x', 'X')]))
    expect(requiredFormatVersion(plain)).toBe(1)
    expect(JSON.stringify(projectForFile(plain))).toBe(JSON.stringify(plain))
    const tagged = makeProject('P', undefined, makeTree('m', 'R', [], { tags: ['a'] }))
    expect(requiredFormatVersion(tagged)).toBe(3)
    expect(JSON.stringify(projectForFile(tagged))).toBe(
      JSON.stringify({ ...tagged, app: { minVersion: 3 } }),
    )
    const pictured = makeProject(
      'P',
      makeTree('b', 'B', [makeTree('i', 'I', [], { image: image() })]),
      makeTree('m', 'R', [], { tags: ['a'], color: 2 }),
    )
    expect(requiredFormatVersion(pictured)).toBe(4)
    expect(projectForFile(pictured).app).toEqual({ minVersion: 4 })
    const mixed = makeProject(
      'P',
      undefined,
      makeTree('m', 'R', [
        makeTree('t', 'T', [], { tags: ['x'] }),
        makeTree('d', 'D', [], { color: 1 }),
      ]),
    )
    expect(requiredFormatVersion(mixed)).toBe(3)
  })

  it('setNodeImage edits only the path, removes, and is a no-op when unchanged', () => {
    const tree = makeTree('r', 'R', [makeTree('a', 'A'), makeTree('b', 'B')])
    const withImage = setNodeImage(tree, 'a', image())
    expect(withImage.children![0].image).toEqual(image())
    expect(withImage.children![1]).toBe(tree.children![1])
    expect(setNodeImage(withImage, 'a', image())).toBe(withImage)
    const removed = setNodeImage(withImage, 'a', null)
    expect(removed.children![0]).not.toHaveProperty('image')
    expect(setNodeImage(removed, 'a', null)).toBe(removed)
  })
})

describe('node images on the map (#149, HC5)', () => {
  const preset = makePreset()

  it('thumbnails are at most 220 px wide (and tall), keeping the aspect ratio', () => {
    expect(thumbSize({ w: 1600, h: 900 })).toEqual({ width: 220, height: 124 })
    expect(thumbSize({ w: 100, h: 50 })).toEqual({ width: 100, height: 50 })
    expect(thumbSize({ w: 400, h: 1600 })).toEqual({ width: 55, height: 220 })
  })

  it('layout reserves the thumbnail from w/h, so loading the picture moves nothing', () => {
    const plain = makeTree('a', 'Wall')
    const pictured = makeTree('a', 'Wall', [], { image: image({ w: 1600, h: 900 }) })
    const before = nodeSize(plain, preset, false, estimateTextWidth)
    const after = nodeSize(pictured, preset, false, estimateTextWidth)
    expect(after.height).toBeCloseTo(before.height + 124 + IMAGE_GAP)
    expect(after.width).toBeGreaterThanOrEqual(220)
    const root = makeTree('r', 'Root', [pictured, makeTree('b', 'B')])
    const first = layoutGeometry(root, preset)
    const again = layoutGeometry({ ...root }, preset, undefined, first)
    // Node reuse (#140) keeps unchanged objects, the pictured node included.
    expect(again.nodes.find((n) => n.id === 'a')).toBe(first.nodes.find((n) => n.id === 'a'))
  })

  it('screen readers hear the image and its description', () => {
    expect(
      nodeAccessibleName(makeTree('a', 'Wall', [], { image: image({ alt: 'Window' }) }), 1),
    ).toContain('image: Window')
    expect(nodeAccessibleName(makeTree('a', 'Wall', [], { image: image() }), 1)).toContain(
      'has an image',
    )
    const before = makeTree('r', 'R', [makeTree('a', 'Wall')])
    const added = setNodeImage(before, 'a', image())
    expect(describeTreeChange(before, added)).toBe('Added an image to “Wall”')
    const described = setNodeImage(added, 'a', image({ alt: 'Window' }))
    expect(describeTreeChange(added, described)).toBe('Described the image of “Wall” as “Window”')
    expect(describeTreeChange(described, before)).toBe('Removed the image of “Wall”')
  })
})
