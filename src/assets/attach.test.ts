import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '../store/editor'
import { useProjects } from '../store/projects'
import { addChild, findNode, makeNode } from '../store/treeOps'
import { resetDatabase } from '../test/resetDb'
import {
  attachImage,
  dropTarget,
  imageTarget,
  removeImage,
  setImageAlt,
  setImageCodec,
} from './attach'
import { isImageFile, pastesImage } from './intake'
import { getAsset, listAssetHashes } from './store'
import type { DecodedImage, ImageCodec } from './process'

let encodes = 0
const codec: ImageCodec<DecodedImage> = {
  async decode() {
    return { width: 800, height: 400, hasAlpha: () => false, close: () => undefined }
  },
  async encode(_image, width, height, type) {
    encodes += 1
    return new Blob([new Uint8Array([width % 256, height % 256, 1])], { type })
  },
}

const pngFile = (name = 'shot.png') =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })

function transfer(files: File[], text = ''): DataTransfer {
  return {
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    types: [...(text ? ['text/plain'] : []), ...(files.length ? ['Files'] : [])],
    getData: (type: string) => (type === 'text/plain' ? text : ''),
  } as unknown as DataTransfer
}

beforeEach(async () => {
  useProjects.setState({ records: [], currentId: null, current: null, loaded: false })
  await useProjects.getState().saveCurrent()
  useEditor.getState().reset()
  await resetDatabase()
  setImageCodec(codec)
  encodes = 0
})

afterEach(() => setImageCodec(null))

async function setupProject() {
  await useProjects.getState().createProject('Images')
  const root = useProjects.getState().current!.map
  const child = makeNode('Wall')
  useEditor.getState().applyTree('map', (tree) => addChild(tree, root.id, child))
  useEditor.setState({ past: [], future: [] })
  return { rootId: root.id, childId: child.id }
}

const mapNode = (id: string) => findNode(useProjects.getState().current!.map, id)?.node

describe('paste and drop routing (#149, HC3)', () => {
  it('finds image files, and pastes an image only when no text comes with it', () => {
    const file = pngFile()
    expect(isImageFile(file)).toBe(true)
    expect(isImageFile({ type: 'application/json', name: 'map.json' })).toBe(false)
    expect(isImageFile({ type: '', name: 'photo.JPG' })).toBe(true)
    expect(isImageFile({ type: 'image/svg+xml' })).toBe(false)
    expect(pastesImage(transfer([file]))).toBe(file)
    // Office copies a picture of the cells next to their text: text wins.
    expect(pastesImage(transfer([file], 'A\tB'))).toBeNull()
    expect(pastesImage(transfer([], 'just text'))).toBeNull()
    expect(
      pastesImage(transfer([new File(['{}'], 'a.json', { type: 'application/json' })])),
    ).toBeNull()
  })

  it('targets the selected node, else a new child of the root or the focused branch', async () => {
    const { rootId, childId } = await setupProject()
    useEditor.getState().select(childId)
    expect(imageTarget('map')).toEqual({ section: 'map', id: childId })
    useEditor.getState().select(null)
    expect(imageTarget('map')).toEqual({ section: 'map', parentId: rootId })
    useEditor.getState().setFocus('map', childId)
    expect(imageTarget('map')).toEqual({ section: 'map', parentId: childId })
    useEditor.getState().setFocus('map', null)

    // A drop goes on the node under the pointer, else on a new node named after the file.
    useEditor.getState().select(childId)
    const none = { mapId: null, rowId: null, rowSection: 'map' as const }
    expect(dropTarget({ ...none, mapId: rootId }, 'a.png')).toEqual({ section: 'map', id: rootId })
    expect(dropTarget({ ...none, rowId: childId }, 'a.png')).toEqual({
      section: 'map',
      id: childId,
    })
    expect(dropTarget(none, 'Site photo.jpeg')).toEqual({
      section: 'map',
      parentId: rootId,
      title: 'Site photo',
    })
    const brainstormRoot = useProjects.getState().current!.brainstorm.id
    expect(
      dropTarget({ ...none, rowId: brainstormRoot, rowSection: 'brainstorm' }, 'x.png'),
    ).toEqual({ section: 'brainstorm', id: brainstormRoot })
  })
})

describe('attaching images (#149)', () => {
  it('puts an image on a node in one undo step; undo and redo never re-encode', async () => {
    const { childId } = await setupProject()
    expect(await attachImage(pngFile(), { section: 'map', id: childId })).toBe(true)
    const image = mapNode(childId)!.image!
    expect(image).toMatchObject({ w: 800, h: 400 })
    expect(image.asset).toMatch(/^sha256-/)
    expect(useEditor.getState().past).toHaveLength(1)
    expect(await getAsset(image.asset)).not.toBeNull()
    const encoded = encodes

    useEditor.getState().undo()
    expect(mapNode(childId)).not.toHaveProperty('image')
    // The bytes stay stored, so redo just puts the reference back.
    expect(await listAssetHashes()).toEqual([image.asset])
    useEditor.getState().redo()
    expect(mapNode(childId)!.image).toEqual(image)
    expect(encodes).toBe(encoded)
  })

  it('makes a new node for an image with no node to go on', async () => {
    const { rootId } = await setupProject()
    expect(
      await attachImage(pngFile('Kitchen plan.png'), { section: 'map', parentId: rootId }),
    ).toBe(true)
    const root = useProjects.getState().current!.map
    const made = root.children!.at(-1)!
    expect(made.title).toBe('Kitchen plan')
    expect(made.image).toMatchObject({ w: 800, h: 400 })
    expect(useEditor.getState().selection).toBe(made.id)
    expect(useEditor.getState().past).toHaveLength(1)
    useEditor.getState().undo()
    expect(useProjects.getState().current!.map.children).toHaveLength(1)
    await attachImage(new File([new Uint8Array([1])], 'image.png', { type: 'image/png' }), {
      section: 'brainstorm',
      parentId: useProjects.getState().current!.brainstorm.id,
    })
    expect(useProjects.getState().current!.brainstorm.children!.at(-1)!.title).toBe('Image')
  })

  it('edits the alt text and removes the image, one undo step each', async () => {
    const { childId } = await setupProject()
    await attachImage(pngFile(), { section: 'map', id: childId })
    setImageAlt('map', childId, '  North wall  ')
    expect(mapNode(childId)!.image!.alt).toBe('North wall')
    setImageAlt('map', childId, 'North wall')
    expect(useEditor.getState().past).toHaveLength(2)
    setImageAlt('map', childId, '')
    expect(mapNode(childId)!.image).not.toHaveProperty('alt')
    removeImage('map', childId)
    expect(mapNode(childId)).not.toHaveProperty('image')
    expect(useEditor.getState().past).toHaveLength(4)
    useEditor.getState().undo()
    expect(mapNode(childId)!.image).toBeDefined()
  })

  it('reports a refused picture and changes nothing', async () => {
    const { childId } = await setupProject()
    const ok = await attachImage(new Blob(['x'], { type: 'text/plain' }), {
      section: 'map',
      id: childId,
    })
    expect(ok).toBe(false)
    expect(mapNode(childId)).not.toHaveProperty('image')
    expect(useEditor.getState().past).toHaveLength(0)
  })
})
