import { describe, expect, it } from 'vitest'
import { validateDoc } from '../schema/validate'
import { buildPacket, restoreFromSource } from './packet'
import { makeProject, makeTree } from '../test/fixtures'

function sampleProject() {
  const brainstorm = makeTree(
    'b-root',
    'Ideas',
    [makeTree('b-1', 'First', [], { notes: 'a note' })],
    { notes: 'keep me' },
  )
  const map = makeTree('m-root', 'Sample', [makeTree('m-1', 'Branch', [], { notes: 'map note' })])
  return makeProject('Sample', brainstorm, map, 'corporate')
}

describe('buildPacket', () => {
  it('produces a schema-valid expand packet with only the brainstorm payload', () => {
    const packet = buildPacket(sampleProject(), 'expand', 'full')
    expect(validateDoc(packet).ok).toBe(true)
    expect(packet.intent).toBe('expand')
    expect(packet.payload.brainstorm?.id).toBe('b-root')
    expect(packet.payload.map).toBeUndefined()
    expect(packet.preset).toBe('corporate')
  })

  it('limits an expand packet to one branch when asked (#146)', () => {
    const packet = buildPacket(sampleProject(), 'expand', 'full', 'p1', 'b-1')
    expect(validateDoc(packet).ok).toBe(true)
    expect(packet.payload.brainstorm?.id).toBe('b-1')
    expect(packet.instructions.rules.join(' ')).toMatch(/one branch/)
    // Other intents always send the whole project.
    expect(
      buildPacket(sampleProject(), 'improve', 'full', 'p1', 'b-1').payload.brainstorm?.id,
    ).toBe('b-root')
  })

  it('includes both trees for improve', () => {
    const packet = buildPacket(sampleProject(), 'improve', 'full')
    expect(packet.payload.brainstorm?.id).toBe('b-root')
    expect(packet.payload.map?.id).toBe('m-root')
    expect(validateDoc(packet).ok).toBe(true)
  })

  it('titles depth strips notes everywhere', () => {
    const packet = buildPacket(sampleProject(), 'improve', 'titles')
    expect(packet.payload.brainstorm?.notes).toBeUndefined()
    expect(packet.payload.brainstorm?.children?.[0].notes).toBeUndefined()
    expect(packet.payload.map?.notes).toBeUndefined()
    expect(packet.payload.map?.children?.[0].notes).toBeUndefined()
  })

  it('full depth keeps notes', () => {
    const packet = buildPacket(sampleProject(), 'expand', 'full')
    expect(packet.payload.brainstorm?.notes).toBe('keep me')
    expect(packet.payload.brainstorm?.children?.[0].notes).toBe('a note')
  })

  it('embeds instructions and a return contract for every intent', () => {
    for (const intent of ['expand', 'convert', 'improve'] as const) {
      const packet = buildPacket(sampleProject(), intent, 'titles')
      expect(packet.instructions.goal.length).toBeGreaterThan(10)
      expect(packet.instructions.rules.length).toBeGreaterThanOrEqual(3)
      expect(packet.returnContract).toMatch(/JSON/)
      expect(validateDoc(packet).ok).toBe(true)
    }
  })

  it('does not mutate the source project', () => {
    const project = sampleProject()
    buildPacket(project, 'improve', 'titles')
    expect(project.brainstorm.notes).toBe('keep me')
    expect(project.brainstorm.children![0].notes).toBe('a note')
  })

  it('stamps projectId and the v1.1 expand contract when a project id is given', () => {
    const packet = buildPacket(sampleProject(), 'expand', 'titles', 'p-123')
    expect(packet.projectId).toBe('p-123')
    expect(validateDoc(packet).ok).toBe(true)
    expect(packet.returnContract).toContain('brainstorm-update')
    expect(packet.returnContract).toContain('"p-123"')
    expect(packet.returnContract).toContain('Do not include a map')
    expect(packet.instructions.rules.join(' ')).toMatch(/no map field/)
  })

  it('omits projectId when none is given but keeps the brainstorm-update contract', () => {
    const packet = buildPacket(sampleProject(), 'expand', 'titles')
    expect(packet.projectId).toBeUndefined()
    expect(validateDoc(packet).ok).toBe(true)
    expect(packet.returnContract).toContain('brainstorm-update')
  })

  it('asks convert and improve replies to carry the project id too', () => {
    for (const intent of ['convert', 'improve'] as const) {
      const packet = buildPacket(sampleProject(), intent, 'titles', 'p-123')
      expect(validateDoc(packet).ok).toBe(true)
      expect(packet.returnContract).toContain('Set "sourceProjectId" to "p-123"')
    }
    expect(buildPacket(sampleProject(), 'convert', 'titles').returnContract).toContain(
      'the projectId from the packet, if there is one',
    )
  })
})

describe('pictures in AI packets (#149)', () => {
  const asset = `sha256-${'b'.repeat(64)}`
  const withPictures = () => {
    const brainstorm = makeTree('b-root', 'Ideas', [
      {
        ...makeTree('b-1', 'Bench', [], { notes: 'Stone' }),
        image: { asset, w: 100, h: 50, alt: 'Grey\nquartz' },
      },
      { ...makeTree('b-2', 'Plan'), image: { asset, w: 100, h: 50 } },
    ])
    return makeProject('Kitchen', brainstorm, makeTree('m-root', 'Kitchen'))
  }

  it('leaves the pictures out and keeps their description as a note line, at either depth', () => {
    for (const depth of ['full', 'titles'] as const) {
      const packet = buildPacket(withPictures(), 'expand', depth, 'p1')
      expect(validateDoc(packet).ok).toBe(true)
      expect(JSON.stringify(packet)).not.toContain('"image"')
      expect(JSON.stringify(packet)).not.toContain(asset)
      const [bench, plan] = packet.payload.brainstorm!.children!
      expect(bench.notes).toBe(
        depth === 'full' ? 'Stone\n\n[image: Grey quartz]' : '[image: Grey quartz]',
      )
      expect(plan.notes).toBe('[image]')
    }
    expect(buildPacket(withPictures(), 'expand', 'full').instructions.rules.join(' ')).toContain(
      '[image: …]',
    )
  })

  it('puts the pictures back by id and drops the note lines when a reply comes back', () => {
    const project = withPictures()
    const reply = buildPacket(project, 'expand', 'full').payload.brainstorm!
    reply.children!.push({
      id: 'new',
      title: 'Splashback',
      notes: 'Tiles\n[image] is not a picture here',
    })
    const restored = restoreFromSource(reply, [project.brainstorm])
    expect(restored.children![0]).toMatchObject({
      notes: 'Stone',
      image: { asset, w: 100, h: 50, alt: 'Grey\nquartz' },
    })
    expect(restored.children![1].notes).toBeUndefined()
    expect(restored.children![1].image).toEqual({ asset, w: 100, h: 50 })
    expect(restored.children![2]).toEqual({
      id: 'new',
      title: 'Splashback',
      notes: 'Tiles\n[image] is not a picture here',
    })
  })

  it('keeps notes the AI never saw: "titles only" replies come back without them (#154)', () => {
    const source = {
      id: 'b',
      title: 'Kitchen',
      notes: 'Budget 20k',
      children: [
        { id: 'c1', title: 'Benchtop', notes: 'Stone, 30 mm' },
        { id: 'c2', title: 'Doors' },
      ],
    }
    const reply = buildPacket({ ...withPictures(), brainstorm: source }, 'improve', 'titles')
      .payload.brainstorm!
    expect(reply.children![0].notes).toBeUndefined()
    reply.children![1].notes = 'Shaker style'
    const restored = restoreFromSource(reply, [source])
    expect(restored.notes).toBe('Budget 20k')
    expect(restored.children![0].notes).toBe('Stone, 30 mm')
    expect(restored.children![1].notes).toBe('Shaker style')
  })
})
