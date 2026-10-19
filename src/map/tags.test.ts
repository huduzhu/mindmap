import { describe, expect, it } from 'vitest'
import { makePreset, makeProject, makeTree } from '../test/fixtures'
import {
  activeTagFilter,
  areCleanTags,
  normalizeNodeTag,
  normalizeNodeTags,
  splitTrailingTags,
  tagColor,
  tagFilterView,
  withTags,
  type TagFilter,
} from './tags'
import { applyTagFilter, countNodeTags, decorateTags, pruneToTags } from './tagFilter'
import { addTagsTo, setTags } from '../store/tagOps'
import { renameNode } from '../store/treeOps'
import { layoutGeometry, nodeSize } from './layout'
import { exportToMarkdown, parseMarkdown } from '../io/markdown'
import { exportToOpml } from '../io/opml'
import { exportToFreemind } from '../io/freemind'
import { dropInvalidMarks, repairTree, emptyRepairStats } from '../io/sanitize'
import { FORMAT_VERSION, projectForFile, requiredFormatVersion } from '../schema/formatVersion'
import { validateDoc } from '../schema/validate'
import { describeTreeChange, nodeAccessibleName } from '../a11y/describe'
import { parseSearchQuery, searchNodes } from '../search/nodes'
import { searchProjects } from '../components/projectSearch'
import { buildPacket } from '../io/packet'
import { estimateTextWidth } from './measure'

const filter = (tags: string[], extra: Partial<TagFilter> = {}): TagFilter => ({
  tags,
  all: false,
  hide: false,
  ...extra,
})

const plan = () =>
  makeTree('root', 'Launch', [
    makeTree('a', 'Pricing', [makeTree('a1', 'Tiers', [], { tags: ['p1'] })], {
      tags: ['q4'],
    }),
    makeTree(
      'b',
      'Backend',
      [
        makeTree('b1', 'Login', [], { tags: ['p1', 'backend'] }),
        makeTree('b2', 'Billing', [], { tags: ['backend'] }),
      ],
      { collapsed: true },
    ),
    makeTree('c', 'Marketing'),
  ])

describe('node tag normalisation (#150, HB1)', () => {
  it('strips #, trims and lowercases; keeps letters of any script, digits, - _ /', () => {
    expect(normalizeNodeTag('  #P1 ')).toBe('p1')
    expect(normalizeNodeTag('##Backend')).toBe('backend')
    expect(normalizeNodeTag('区域/华东')).toBe('区域/华东')
    expect(normalizeNodeTag('team_a-1')).toBe('team_a-1')
    expect(normalizeNodeTag('Ünïcode')).toBe('ünïcode')
  })

  it('drops what is not a tag', () => {
    for (const bad of ['', '#', 'two words', 'a.b', 'x'.repeat(33), 'tag!', 42, null]) {
      expect(normalizeNodeTag(bad)).toBeNull()
    }
    expect(normalizeNodeTag('x'.repeat(32))).toBe('x'.repeat(32))
  })

  it('dedupes, caps at 10 and returns undefined for nothing usable', () => {
    expect(normalizeNodeTags(['P1', '#p1', 'bad tag', 'q4'])).toEqual(['p1', 'q4'])
    expect(normalizeNodeTags(Array.from({ length: 14 }, (_, i) => `t${i}`))).toHaveLength(10)
    expect(normalizeNodeTags(['!!'])).toBeUndefined()
    expect(normalizeNodeTags('p1')).toBeUndefined()
    expect(areCleanTags(['p1', 'q4'])).toBe(true)
    expect(areCleanTags(['P1'])).toBe(false)
    expect(areCleanTags([])).toBe(false)
  })

  it('adds tags without duplicates and keeps the array when nothing is new', () => {
    const tags = ['p1']
    expect(withTags(tags, ['p1'])).toBe(tags)
    expect(withTags(tags, ['q4', 'p1'])).toEqual(['p1', 'q4'])
    expect(withTags(undefined, ['a'])).toEqual(['a'])
  })

  it('sanitising repairs tags on import, sync and restore', () => {
    const doc = makeProject(
      'P',
      undefined,
      makeTree('m', 'Root', [makeTree('x', 'X', [], { tags: ['#P1', 'p1', 'no way'] })]),
    )
    const cleaned = dropInvalidMarks(doc)
    expect(cleaned.map.children![0].tags).toEqual(['p1'])
    const empty = makeTree('m', 'Root', [], { tags: ['!!'] })
    expect(repairTree(empty, new Set(), emptyRepairStats())).not.toHaveProperty('tags')
    expect(validateDoc(cleaned).ok).toBe(true)
  })

  it('the schema takes clean tags and refuses unusable ones', () => {
    const ok = makeProject('P', undefined, makeTree('m', 'Root', [], { tags: ['p1', '华东'] }))
    expect(validateDoc(ok).ok).toBe(true)
    const bad = makeProject('P', undefined, makeTree('m', 'Root', [], { tags: ['a b'] }))
    expect(validateDoc(bad).ok).toBe(false)
    const many = makeProject(
      'P',
      undefined,
      makeTree('m', 'Root', [], { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }),
    )
    expect(validateDoc(many).ok).toBe(false)
  })
})

describe('file format 3 (#150, GE0a)', () => {
  it('needs format 3 only when a node has tags', () => {
    expect(FORMAT_VERSION).toBeGreaterThanOrEqual(3)
    const plain = makeProject('P', undefined, makeTree('m', 'Root', [makeTree('x', 'X')]))
    expect(requiredFormatVersion(plain)).toBe(1)
    expect(projectForFile(plain)).not.toHaveProperty('app')
    const v2 = makeProject('P', undefined, makeTree('m', 'R', [], { role: 'task', done: true }))
    expect(requiredFormatVersion(v2)).toBe(2)
    const tagged = makeProject('P', makeTree('b', 'B', [makeTree('i', 'I', [], { tags: ['x'] })]))
    expect(requiredFormatVersion(tagged)).toBe(3)
    expect(projectForFile(tagged).app).toEqual({ minVersion: 3 })
    const both = { ...tagged, links: [{ from: 'a', to: 'b', label: 'x' }] }
    expect(requiredFormatVersion(both)).toBe(3)
    expect(requiredFormatVersion({ ...plain, links: [{ from: 'a', to: 'b', label: 'x' }] })).toBe(2)
  })

  it('a file without node tags stays byte for byte what it was', () => {
    const project = makeProject('P', undefined, makeTree('m', 'R', [], { color: 2 }))
    expect(JSON.stringify(projectForFile(project))).toBe(
      JSON.stringify({ ...project, app: { minVersion: 2 } }),
    )
  })
})

describe('#word at the end of a title (#150, HB-D1)', () => {
  it('turns trailing tags into tags and keeps the rest of the title', () => {
    expect(splitTrailingTags('Fix login #p1 #backend')).toEqual({
      title: 'Fix login',
      tags: ['p1', 'backend'],
    })
    expect(splitTrailingTags('  Plan #Q4  ')).toEqual({ title: 'Plan', tags: ['q4'] })
    expect(splitTrailingTags('Plan #a #a')).toEqual({ title: 'Plan', tags: ['a'] })
  })

  it('leaves text that is not a trailing tag alone', () => {
    expect(splitTrailingTags('#x')).toEqual({ title: '#x', tags: [] })
    expect(splitTrailingTags('#x #y')).toEqual({ title: '#x', tags: ['y'] })
    expect(splitTrailingTags('Learn C#')).toEqual({ title: 'Learn C#', tags: [] })
    expect(splitTrailingTags('Issue #12')).toEqual({ title: 'Issue #12', tags: [] })
    expect(splitTrailingTags('#p1 first')).toEqual({ title: '#p1 first', tags: [] })
    expect(splitTrailingTags('Mixed #ok #no!')).toEqual({ title: 'Mixed #ok #no!', tags: [] })
  })

  it('a rename adds the tags to the node in the same edit', () => {
    const tree = makeTree('r', 'Root', [makeTree('a', 'Old', [], { tags: ['p1'] })])
    const next = renameNode(tree, 'a', 'New', ['backend', 'p1'])
    expect(next.children![0]).toMatchObject({ title: 'New', tags: ['p1', 'backend'] })
    expect(renameNode(next, 'a', 'New', ['p1'])).toBe(next)
  })
})

describe('tag edits (#150, HB2)', () => {
  it('sets and clears the tags of one node', () => {
    const tree = plan()
    const next = setTags(tree, 'c', ['q4'])
    expect(next.children![2].tags).toEqual(['q4'])
    expect(setTags(next, 'c', ['q4'])).toBe(next)
    expect(setTags(next, 'c', []).children![2]).not.toHaveProperty('tags')
  })

  it('adds tags to every selected node in one tree edit', () => {
    const tree = plan()
    const next = addTagsTo(tree, new Set(['a', 'c']), ['launch'])
    expect(next.children![0].tags).toEqual(['q4', 'launch'])
    expect(next.children![2].tags).toEqual(['launch'])
    expect(next.children![1]).toBe(tree.children![1])
    expect(addTagsTo(next, new Set(['a']), ['launch'])).toBe(next)
  })
})

describe('the tag filter (#150, HB4)', () => {
  it('counts the tags of a tree, most used first', () => {
    expect(countNodeTags(plan())).toEqual([
      ['backend', 2],
      ['p1', 2],
      ['q4', 1],
    ])
  })

  it('highlight mode: matches, their path and the rest', () => {
    const result = applyTagFilter(plan(), filter(['p1']))
    expect(result.matches).toBe(2)
    expect(Object.fromEntries(result.states)).toEqual({
      root: 'path',
      a: 'path',
      a1: 'match',
      b: 'path',
      b1: 'match',
      b2: 'dim',
      c: 'dim',
    })
    // The folded "Backend" hides one match.
    expect([...result.folded]).toEqual([['b', 1]])
  })

  it('any of or all of the picked tags', () => {
    expect(applyTagFilter(plan(), filter(['p1', 'backend'])).matches).toBe(3)
    expect(applyTagFilter(plan(), filter(['p1', 'backend'], { all: true })).matches).toBe(1)
  })

  it('hide mode keeps only the matches and their path to the root', () => {
    const tree = plan()
    const pruned = pruneToTags(tree, filter(['backend']))
    expect(pruned.children!.map((c) => c.id)).toEqual(['b'])
    expect(pruned.children![0].children!.map((c) => c.id)).toEqual(['b1', 'b2'])
    // An unchanged branch keeps its object, so its measured size is reused.
    expect(pruned.children![0]).toBe(tree.children![1])
    const kept = pruneToTags(tree, filter(['backend']), new Set(['c']))
    expect(kept.children!.map((c) => c.id)).toEqual(['b', 'c'])
    expect(pruneToTags(tree, filter(['none'])).children).toEqual([])
  })

  it('needs a tag to be on, and the map finds the maths once it has loaded', () => {
    expect(activeTagFilter(filter([]))).toBeNull()
    expect(activeTagFilter(null)).toBeNull()
    const on = filter(['p1'])
    expect(activeTagFilter(on)).toBe(on)
    expect(tagFilterView()?.apply).toBe(applyTagFilter)
  })

  it('dims map nodes and edges by class and counts matches in folded nodes', () => {
    const tree = plan()
    const layout = layoutGeometry(tree, makePreset())
    const result = applyTagFilter(tree, filter(['p1']))
    const dimmed = decorateTags(layout, result, true)
    const byId = new Map(dimmed.nodes.map((node) => [node.id, node]))
    expect(byId.get('a1')!.className).toBeUndefined()
    expect(byId.get('a')!.className).toBe('tag-path')
    expect(byId.get('c')!.className).toBe('tag-dim')
    expect(byId.get('b')!.data.tagHits).toBe(1)
    expect(dimmed.edges.find((edge) => edge.target === 'c')!.className).toBe('tag-dim')
    // Nodes nothing changed for keep their objects.
    expect(byId.get('a1')).toBe(layout.nodes.find((node) => node.id === 'a1'))
    // Hide mode adds no dimming, only the folded counts.
    const hidden = decorateTags(layout, result, false)
    expect(hidden.nodes.every((node) => node.className === undefined)).toBe(true)
    expect(decorateTags(layout, null, true)).toBe(layout)
  })
})

describe('showing tags (#150, HB3)', () => {
  it('a stable colour from the preset for each tag', () => {
    const colors = ['#111111', '#222222', '#333333']
    expect(tagColor('p1', colors)).toBe(tagColor('p1', colors))
    expect(colors).toContain(tagColor('backend', colors))
    const spread = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((t) => tagColor(t, colors)))
    expect(spread.size).toBeGreaterThan(1)
    expect(tagColor('p1', [])).toBeUndefined()
  })

  it('the map reserves a row for the chips', () => {
    const preset = makePreset()
    const plain = nodeSize(makeTree('a', 'Login'), preset, false, estimateTextWidth)
    const tagged = nodeSize(
      makeTree('a', 'Login', [], { tags: ['p1', 'backend', 'auth', 'q4'] }),
      preset,
      false,
      estimateTextWidth,
    )
    expect(tagged.height).toBeGreaterThan(plain.height)
    expect(tagged.width).toBeGreaterThan(plain.width)
  })

  it('screen readers hear the tags, and tag edits are announced', () => {
    const node = makeTree('a', 'Login', [], { tags: ['p1', 'backend'] })
    expect(nodeAccessibleName(node, 1)).toContain('tagged #p1, #backend')
    const before = makeTree('r', 'Root', [makeTree('a', 'Login')])
    const after = makeTree('r', 'Root', [node])
    expect(describeTreeChange(before, after)).toBe('Tags of “Login”: #p1, #backend')
    expect(describeTreeChange(after, before)).toBe('Removed the tags of “Login”')
  })
})

describe('search by tag (#150, HB5)', () => {
  it('#p1 finds tagged nodes; #p1 with text needs both', () => {
    const tree = plan()
    expect(searchNodes(tree, '#p1 ').map((hit) => hit.id)).toEqual(['a1', 'b1'])
    expect(searchNodes(tree, '#p1 login').map((hit) => hit.id)).toEqual(['b1'])
    expect(searchNodes(tree, '#P1 #backend ').map((hit) => hit.id)).toEqual(['b1'])
    // While typing, the last tag also matches as a prefix.
    expect(searchNodes(tree, '#back').map((hit) => hit.id)).toEqual(['b1', 'b2'])
    expect(searchNodes(tree, '#back ').map((hit) => hit.id)).toEqual([])
    expect(searchNodes(tree, 'pricing').map((hit) => hit.id)).toEqual(['a'])
    expect(parseSearchQuery('C# #x')).toEqual({
      tags: [{ tag: 'x', prefix: true }],
      text: 'c#',
    })
  })

  it('the start screen finds projects whose nodes carry a tag', () => {
    const record = (id: string, project: ReturnType<typeof makeProject>) => ({
      id,
      project,
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
    const tagged = record('A', makeProject('Roadmap', makeTree('b', 'B'), plan()))
    const other = record('B', makeProject('Shopping', makeTree('b2', 'B'), makeTree('m', 'M')))
    expect(searchProjects([tagged, other], '#p1')).toEqual([
      { record: tagged, tagged: { tag: 'p1', count: 2 } },
    ])
    expect(searchProjects([tagged, other], 'backend')).toEqual([
      { record: tagged, tagged: { tag: 'backend', count: 2 } },
    ])
  })
})

describe('exports keep tags (#150, HB6)', () => {
  it('Markdown writes trailing #tags and reads them back', () => {
    const tree = makeTree(
      'r',
      'Launch',
      [
        makeTree('a', 'Fix login', [makeTree('a1', 'Hash', [], { tags: ['区域/华东'] })], {
          tags: ['p1', 'backend'],
          role: 'task',
        }),
        makeTree('b', 'Issue #12'),
      ],
      { tags: ['q4'] },
    )
    const text = exportToMarkdown(tree)
    expect(text).toContain('# Launch #q4\n')
    expect(text).toContain('  - [ ] Fix login #p1 #backend\n')
    const back = parseMarkdown(text)
    expect(back).toMatchObject({ title: 'Launch', tags: ['q4'] })
    expect(back.children![0]).toMatchObject({ title: 'Fix login', tags: ['p1', 'backend'] })
    expect(back.children![0].children![0]).toMatchObject({ title: 'Hash', tags: ['区域/华东'] })
    expect(back.children![1]).toMatchObject({ title: 'Issue #12' })
    expect(back.children![1]).not.toHaveProperty('tags')
    expect(exportToMarkdown(back)).toBe(text)
  })

  it('OPML has _tags and FreeMind a tags attribute', () => {
    const tree = makeTree('r', 'Root', [makeTree('a', 'A', [], { tags: ['p1', 'q4'] })])
    expect(exportToOpml(tree, 'P')).toContain('text="A" _tags="p1 q4"')
    expect(exportToFreemind(tree)).toContain('<attribute NAME="tags" VALUE="p1 q4"/>')
  })

  it('the AI packet documents the field and a reply with tags validates', () => {
    const project = makeProject('P', plan(), makeTree('m', 'Map'))
    const packet = buildPacket(project, 'expand', 'full')
    expect(packet.instructions.rules.join('\n')).toContain('"tags"')
    const reply = {
      kind: 'brainstorm-update',
      schemaVersion: 1,
      sourceProjectId: 'p-1',
      name: 'P',
      preset: 'default',
      brainstorm: makeTree('root', 'Launch', [makeTree('n', 'New', [], { tags: ['#New', 'p1'] })]),
    }
    const cleaned = dropInvalidMarks(reply)
    expect(cleaned.brainstorm.children![0].tags).toEqual(['new', 'p1'])
    expect(validateDoc(cleaned).ok).toBe(true)
  })
})
