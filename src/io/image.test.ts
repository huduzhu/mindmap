import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import defaultPreset from '../../presets/default.json'
import '../map/tagFilter'
import type { Preset, TreeNode } from '../schema/types'
import { useEditor } from '../store/editor'
import { makeProject } from '../test/fixtures'
import { exportCanvasImage, exportFrameRoot } from './image'

const preset = defaultPreset as unknown as Preset

function titles(node: TreeNode): string[] {
  return [node.title, ...(node.children ?? []).flatMap(titles)]
}

/** A map with a small branch and a wide one, so framing either gives a different box. */
function map(): TreeNode {
  return {
    id: 'm',
    title: 'Kitchen',
    children: [
      {
        id: 'a',
        title: 'Bench',
        tags: ['p1'],
        children: [{ id: 'a1', title: 'Stone' }],
      },
      {
        id: 'b',
        title: 'Cabinets',
        children: Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, title: `Door ${i}` })),
      },
    ],
  }
}

function resetEditor(): void {
  useEditor.setState({
    focus: { map: null, outline: null, brainstorm: null },
    tagFilter: { map: null, outline: null, brainstorm: null },
    editing: null,
  })
}

/** As setFocus does with the project open (the branch export focuses the same way). */
function focusMapOn(id: string): void {
  useEditor.setState({ focus: { map: id, outline: null, brainstorm: null } })
}

beforeEach(resetEditor)
afterEach(() => {
  resetEditor()
  document.body.innerHTML = ''
})

describe('what an image export or print frames', () => {
  it('is the whole map with no focus or filter', () => {
    expect(titles(exportFrameRoot(map()))).toEqual(titles(map()))
  })

  it('is only the branch the map is focused on', () => {
    focusMapOn('a')
    expect(titles(exportFrameRoot(map()))).toEqual(['Bench', 'Stone'])
  })

  it('leaves out the nodes a hide-mode tag filter hides, but not in highlight mode', () => {
    useEditor.setState({
      tagFilter: { map: { tags: ['p1'], all: false, hide: true }, outline: null, brainstorm: null },
    })
    expect(titles(exportFrameRoot(map()))).toEqual(['Kitchen', 'Bench'])
    useEditor.setState({
      tagFilter: {
        map: { tags: ['p1'], all: false, hide: false },
        outline: null,
        brainstorm: null,
      },
    })
    expect(titles(exportFrameRoot(map()))).toEqual(titles(map()))
  })

  it('keeps a branch export whole: the branch is passed as the map, focused on itself', () => {
    const branch = map().children![1]
    focusMapOn(branch.id)
    expect(titles(exportFrameRoot(branch))).toEqual(titles(branch))
  })

  it('sizes a framed capture to the focused branch, not the whole map', async () => {
    // html-to-image checks for SVG images, which jsdom does not define.
    const scope = globalThis as { SVGImageElement?: unknown }
    const hadSvgImage = 'SVGImageElement' in scope
    scope.SVGImageElement ??= class {}
    onTestFinished(() => {
      if (!hadSvgImage) delete scope.SVGImageElement
    })
    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    document.body.appendChild(viewport)
    const size = async () => {
      const blob = await exportCanvasImage(
        'svg',
        preset,
        makeProject('P', undefined, map()),
        'bounds',
      )
      const svg = await blob.text()
      return {
        width: Number(svg.match(/<svg[^>]*\swidth="(\d+)"/)?.[1]),
        height: Number(svg.match(/<svg[^>]*\sheight="(\d+)"/)?.[1]),
      }
    }
    const whole = await size()
    focusMapOn('a')
    const focused = await size()
    expect(focused.height).toBeGreaterThan(0)
    expect(focused.height).toBeLessThan(whole.height)
  })
})
