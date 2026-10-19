import { describe, expect, it } from 'vitest'
import { makeProject, makeTree } from '../test/fixtures'
import {
  firstEmoji,
  isDone,
  isEmojiMarker,
  isTask,
  markerColor,
  splitLeadingEmoji,
  taskProgress,
} from './marks'
import { resolveNodeStyle } from './nodeStyle'
import { CLIPBOARD_KIND, parsePayload, withFreshIds } from './clipboard'
import { findNode, setMark, toggleDone } from '../store/treeOps'
import { exportToMarkdown, parseMarkdown } from '../io/markdown'
import { exportToOpml } from '../io/opml'
import { exportToFreemind } from '../io/freemind'
import { brainstormToBranches } from './fromBrainstorm'
import { layoutGeometry, nodeSize } from './layout'
import { cleanLinkLabel, normalizeLinks, setLinkLabel } from '../store/links'
import { estimateTextWidth } from './measure'
import { describeLinkChange, describeTreeChange, nodeAccessibleName } from '../a11y/describe'
import { projectForFile, requiredFormatVersion } from '../schema/formatVersion'
import { validateDoc } from '../schema/validate'
import { dropInvalidMarks, repairTree, emptyRepairStats } from '../io/sanitize'
import { makePreset } from '../test/fixtures'

const tasks = () =>
  makeTree('root', 'Kitchen', [
    makeTree('p', 'Order', [
      makeTree('t1', 'Tiles', [], { role: 'task', done: true }),
      makeTree('t2', 'Taps', [], { role: 'task' }),
      makeTree('n', 'Note', [], { role: 'idea' }),
      makeTree('t3', 'Grout', [makeTree('t3a', 'Sub', [], { role: 'task', done: true })], {
        role: 'task',
      }),
    ]),
  ])

describe('task done state (#148a)', () => {
  it('counts only direct task children for the progress chip', () => {
    const tree = tasks()
    expect(taskProgress(tree.children![0])).toEqual({ done: 1, total: 3 })
    expect(taskProgress(tree)).toBeNull()
    expect(taskProgress(tree.children![0].children![3])).toEqual({ done: 1, total: 1 })
  })

  it('shows done only on tasks, but keeps it on other nodes', () => {
    const node = makeTree('x', 'X', [], { role: 'idea', done: true })
    expect(isTask(node)).toBe(false)
    expect(isDone(node)).toBe(false)
    expect(isDone({ ...node, role: 'task' })).toBe(true)
  })

  it('toggles a task, and makes any other node a task first', () => {
    const tree = tasks()
    const once = toggleDone(tree, 't2')
    expect(once.children![0].children![1]).toMatchObject({ role: 'task', done: true })
    const twice = toggleDone(once, 't2')
    expect(twice.children![0].children![1]).not.toHaveProperty('done')
    const made = toggleDone(tree, 'n')
    expect(made.children![0].children![2]).toEqual({
      id: 'n',
      title: 'Note',
      children: [],
      role: 'task',
    })
    // Untouched branches keep their objects.
    expect(once.children![0].children![0]).toBe(tree.children![0].children![0])
  })

  it('writes and reads Markdown task lists', () => {
    const md = exportToMarkdown(tasks())
    expect(md).toContain('  - Order')
    expect(md).toContain('    - [x] Tiles')
    expect(md).toContain('    - [ ] Taps')
    expect(md).toContain('    - Note')
    expect(md).toContain('      - [x] Sub')
    const back = parseMarkdown(md)
    const order = back.children![0]
    expect(order.children![0]).toMatchObject({ title: 'Tiles', role: 'task', done: true })
    expect(order.children![1]).toMatchObject({ title: 'Taps', role: 'task' })
    expect(order.children![1]).not.toHaveProperty('done')
    expect(order.children![2]).not.toHaveProperty('role')
    expect(parseMarkdown('# R\n- [X] Upper').children![0]).toMatchObject({ done: true })
  })

  it('keeps tasks in OPML and FreeMind', () => {
    const opml = exportToOpml(tasks(), 'K')
    expect(opml).toContain('text="Tiles" _task="true" _done="true"')
    expect(opml).toContain('text="Taps" _task="true" />')
    const mm = exportToFreemind(tasks())
    expect(mm).toContain('<icon BUILTIN="button_ok"/>')
    expect(mm).toContain('<attribute NAME="task" VALUE="open"/>')
  })

  it('carries tasks from Brainstorm to the map', () => {
    const [order] = brainstormToBranches(makeTree('b', 'B', [tasks().children![0]]))
    expect(order.role).toBe('main-branch')
    expect(order.children![0]).toMatchObject({ role: 'task', done: true })
    expect(order.children![1].role).toBe('task')
    expect(order.children![1]).not.toHaveProperty('done')
  })

  it('makes room for the checkbox beside and the progress chip under the title', () => {
    const preset = makePreset()
    const plain = nodeSize(makeTree('a', 'Order tiles'), preset, false, estimateTextWidth)
    const task = nodeSize(
      makeTree('a', 'Order tiles', [], { role: 'task' }),
      preset,
      false,
      estimateTextWidth,
    )
    const parent = nodeSize(tasks().children![0], preset, false, estimateTextWidth)
    const plainParent = nodeSize(makeTree('p', 'Order'), preset, false, estimateTextWidth)
    expect(task.width).toBeGreaterThanOrEqual(plain.width + 20)
    // The chip goes under the title: taller, not wider, so the branch keeps its place.
    expect(parent.width).toBe(plainParent.width)
    expect(parent.height).toBeCloseTo(plainParent.height + 14 * 0.75 * 1.35 + 2)
  })

  it('tells screen readers about done and progress', () => {
    const tree = tasks()
    expect(nodeAccessibleName(tree.children![0].children![0], 2)).toContain('task, done')
    expect(nodeAccessibleName(tree.children![0].children![1], 2)).toContain('task, not done')
    expect(nodeAccessibleName(tree.children![0], 1)).toContain('1 of 3 tasks done')
    expect(describeTreeChange(tree, toggleDone(tree, 't2'))).toBe('Marked “Taps” done')
    expect(describeTreeChange(tree, toggleDone(tree, 't1'))).toBe('Marked “Tiles” not done')
  })
})

describe('file format 2 (#148, GE0)', () => {
  it('needs format 2 only when a node uses done', () => {
    const plain = makeProject('P')
    expect(requiredFormatVersion(plain)).toBe(1)
    expect(projectForFile(plain)).toBe(plain)
    const withTask = makeProject('P', undefined, tasks())
    expect(requiredFormatVersion(withTask)).toBe(2)
    expect(projectForFile(withTask).app).toEqual({ minVersion: 2 })
    const brainstormTask = makeProject(
      'P',
      makeTree('b', 'B', [makeTree('x', 'X', [], { done: true })]),
    )
    expect(requiredFormatVersion(brainstormTask)).toBe(2)
    // A stale block is replaced by what the content needs.
    expect(projectForFile({ ...plain, app: { minVersion: 2 } })).not.toHaveProperty('app')
  })

  it('validates the new field and its app block', () => {
    const doc = projectForFile(makeProject('P', undefined, tasks()))
    expect(validateDoc(doc).ok).toBe(true)
    const bad = makeProject('P', undefined, {
      id: 'm',
      title: 'M',
      done: 'yes' as unknown as boolean,
    })
    expect(validateDoc(bad).ok).toBe(false)
  })

  it('drops an unusable done value instead of refusing the project', () => {
    const bad = makeProject('P', undefined, {
      id: 'm',
      title: 'M',
      children: [{ id: 'c', title: 'C', role: 'task', done: 'yes' as unknown as boolean }],
    })
    const cleaned = dropInvalidMarks(bad)
    expect(cleaned.map.children![0]).not.toHaveProperty('done')
    expect(validateDoc(cleaned).ok).toBe(true)
    expect(cleaned.brainstorm).toBe(bad.brainstorm)
    const repaired = repairTree(bad.map, new Set(), emptyRepairStats())
    expect(repaired.children![0]).toEqual({ id: 'c', title: 'C', role: 'task' })
  })
})

describe('colour and emoji markers (#148b)', () => {
  it('accepts exactly one emoji as a marker', () => {
    for (const icon of ['🔥', '⚠️', '1️⃣', '🇦🇺', '👨‍👩‍👧‍👦', '❤️']) {
      expect(isEmojiMarker(icon), icon).toBe(true)
    }
    for (const icon of ['', 'a', 'ab', '🔥🔥', '🔥 ', ' 🔥', '中', '→', 7]) {
      expect(isEmojiMarker(icon), String(icon)).toBe(false)
    }
    expect(firstEmoji('  🚀 launch')).toBe('🚀')
    expect(firstEmoji('launch 🚀')).toBeNull()
    expect(splitLeadingEmoji('🔥 Hot lead')).toEqual({ icon: '🔥', title: 'Hot lead' })
    expect(splitLeadingEmoji('🔥')).toEqual({ title: '🔥' })
    expect(splitLeadingEmoji('Hot 🔥')).toEqual({ title: 'Hot 🔥' })
  })

  it('takes colours from the preset palette by slot, wrapping around', () => {
    const palette = { branchColors: ['#111111', '#222222', '#333333'] }
    expect(markerColor(palette, 1)).toBe('#111111')
    expect(markerColor(palette, 3)).toBe('#333333')
    expect(markerColor(palette, 5)).toBe('#222222')
    expect(markerColor(palette, undefined)).toBeUndefined()
    expect(markerColor(palette, 0)).toBeUndefined()
    expect(markerColor(palette, 9)).toBeUndefined()
  })

  it('sets and clears a marker without empty undo steps', () => {
    const tree = tasks()
    const marked = setMark(tree, 't2', 'icon', '🔥')
    expect(findNode(marked, 't2')!.node.icon).toBe('🔥')
    expect(setMark(marked, 't2', 'icon', '🔥')).toBe(marked)
    const cleared = setMark(marked, 't2', 'icon', undefined)
    expect(findNode(cleared, 't2')!.node).not.toHaveProperty('icon')
    expect(findNode(setMark(tree, 'p', 'color', 4), 'p')!.node.color).toBe(4)
    expect(describeTreeChange(tree, marked)).toBe('Marked “Taps” with 🔥')
    expect(describeTreeChange(marked, cleared)).toBe('Removed the marker of “Taps”')
    expect(describeTreeChange(tree, setMark(tree, 'p', 'color', 2))).toBe(
      'Set the colour of “Order”',
    )
  })

  it('shows the colour as a bar and makes room for the emoji', () => {
    const preset = makePreset()
    const node = makeTree('a', 'Hot lead', [], { color: 1, icon: '🔥' })
    expect(resolveNodeStyle(preset, node, false).boxShadow).toContain('#6366f1')
    expect(resolveNodeStyle(preset, makeTree('b', 'B'), false).boxShadow).toBeUndefined()
    const plain = nodeSize(makeTree('a', 'Hot lead'), preset, false, estimateTextWidth)
    const withIcon = nodeSize(node, preset, false, estimateTextWidth)
    expect(withIcon.width).toBeGreaterThanOrEqual(plain.width + 14 * 1.25 + 4)
    expect(nodeAccessibleName(node, 1)).toMatch(/^🔥 Hot lead, level 1/)
  })

  it('exports the emoji as text and reads it back from Markdown', () => {
    const tree = makeTree(
      'r',
      'Plan',
      [
        makeTree('a', 'Hot lead', [], { icon: '🔥', color: 2 }),
        makeTree('b', 'Ship', [], { icon: '🚀', role: 'task', done: true }),
      ],
      { icon: '⭐' },
    )
    const md = exportToMarkdown(tree)
    expect(md).toContain('# ⭐ Plan')
    expect(md).toContain('  - 🔥 Hot lead')
    expect(md).toContain('  - [x] 🚀 Ship')
    const back = parseMarkdown(md)
    expect(back).toMatchObject({ title: 'Plan', icon: '⭐' })
    expect(back.children![0]).toMatchObject({ title: 'Hot lead', icon: '🔥' })
    expect(back.children![0]).not.toHaveProperty('color')
    expect(back.children![1]).toMatchObject({ title: 'Ship', icon: '🚀', role: 'task', done: true })
    expect(exportToOpml(tree, 'P')).toContain('text="Hot lead" _icon="🔥" _color="2"')
    expect(exportToFreemind(tree)).toContain('<attribute NAME="icon" VALUE="🔥"/>')
    const [branch] = brainstormToBranches(tree)
    expect(branch).toMatchObject({ icon: '🔥', color: 2 })
  })

  it('needs format 2, validates, and drops unusable values', () => {
    const project = makeProject(
      'P',
      undefined,
      makeTree('m', 'M', [makeTree('a', 'A', [], { icon: '🔥' })]),
    )
    expect(requiredFormatVersion(project)).toBe(2)
    expect(requiredFormatVersion(makeProject('P', makeTree('b', 'B', [], { color: 1 })))).toBe(2)
    expect(validateDoc(projectForFile(project)).ok).toBe(true)
    for (const bad of [
      { color: 0 },
      { color: 9 },
      { color: '3' },
      { icon: 'x' },
      { icon: '🔥 hot' },
    ]) {
      const doc = makeProject('P', undefined, { id: 'm', title: 'M', ...bad } as never)
      expect(validateDoc(doc).ok, JSON.stringify(bad)).toBe(false)
      const cleaned = dropInvalidMarks(doc)
      expect(validateDoc(cleaned).ok, JSON.stringify(bad)).toBe(true)
      expect(cleaned.map).toEqual({ id: 'm', title: 'M' })
    }
    // The schema lets two emoji through; the app keeps only one-emoji markers.
    const two = makeProject('P', undefined, { id: 'm', title: 'M', icon: '🔥🔥' })
    expect(validateDoc(two).ok).toBe(true)
    expect(dropInvalidMarks(two).map).not.toHaveProperty('icon')
  })
})

describe('labels on cross-links (#148c)', () => {
  const linked = () =>
    makeProject(
      'P',
      undefined,
      makeTree('m', 'M', [makeTree('a', 'A', [], { side: 'right' }), makeTree('b', 'B')]),
    )

  it('cleans, sets and clears labels, whichever way the link points', () => {
    expect(cleanLinkLabel('  depends\n on  ')).toBe('depends on')
    expect(cleanLinkLabel('   ')).toBeUndefined()
    expect(cleanLinkLabel(7)).toBeUndefined()
    expect(Array.from(cleanLinkLabel('字'.repeat(90))!)).toHaveLength(80)
    const links = [{ from: 'a', to: 'b' }]
    const set = setLinkLabel(links, 'b', 'a', ' blocks ')
    expect(set).toEqual([{ from: 'a', to: 'b', label: 'blocks' }])
    expect(setLinkLabel(set, 'a', 'b', 'blocks')).toBe(set)
    expect(setLinkLabel(set, 'a', 'b', '')).toEqual([{ from: 'a', to: 'b' }])
    expect(normalizeLinks(linked().map, set)).toEqual(set)
    expect(describeLinkChange(linked().map, links, set)).toBe(
      'Labelled the link between “A” and “B” “blocks”',
    )
    expect(describeLinkChange(linked().map, set, links)).toBe(
      'Removed the label of the link between “A” and “B”',
    )
  })

  it('puts the label on the link edge and rebuilds only that edge', () => {
    const preset = makePreset()
    const project = linked()
    const before = layoutGeometry(project.map, preset, [{ from: 'a', to: 'b' }])
    const after = layoutGeometry(
      project.map,
      preset,
      [{ from: 'a', to: 'b', label: 'blocks' }],
      before,
    )
    const link = after.edges.find((edge) => edge.type === 'linkEdge')!
    expect(link.label).toBe('blocks')
    expect(link.data).toMatchObject({
      labelText: preset.palette.text,
      labelFill: preset.palette.nodeFill,
    })
    expect(link).not.toBe(before.edges.find((edge) => edge.type === 'linkEdge'))
    const treeEdges = (layout: typeof after) => layout.edges.filter((e) => e.type === 'mapEdge')
    treeEdges(after).forEach((edge, i) => expect(edge).toBe(treeEdges(before)[i]))
    after.nodes.forEach((node, i) => expect(node).toBe(before.nodes[i]))
  })

  it('needs format 2, validates, and repairs bad labels', () => {
    const project = { ...linked(), links: [{ from: 'a', to: 'b', label: 'blocks' }] }
    expect(requiredFormatVersion(linked())).toBe(1)
    expect(requiredFormatVersion(project)).toBe(2)
    expect(validateDoc(projectForFile(project)).ok).toBe(true)
    const long = { ...linked(), links: [{ from: 'a', to: 'b', label: 'x'.repeat(81) }] }
    expect(validateDoc(long).ok).toBe(false)
    expect(dropInvalidMarks(long).links).toEqual([{ from: 'a', to: 'b', label: 'x'.repeat(80) }])
    const blank = { ...linked(), links: [{ from: 'a', to: 'b', label: ' ' }] }
    expect(dropInvalidMarks(blank).links).toEqual([{ from: 'a', to: 'b' }])
    expect(validateDoc(dropInvalidMarks(blank)).ok).toBe(true)
  })
})

describe('copy and paste keep #148 fields', () => {
  it('reads tasks, markers and link labels from the clipboard and keeps them on fresh ids', () => {
    const payload = parsePayload(
      JSON.stringify({
        kind: CLIPBOARD_KIND,
        version: 1,
        nodes: [
          { id: 'a', title: 'A', role: 'task', done: true, color: 3, icon: '🔥' },
          { id: 'b', title: 'B', color: 99, icon: 'nope', done: 'yes' },
        ],
        links: [{ from: 'a', to: 'b', label: ' blocks ' }],
      }),
    )!
    expect(payload.nodes[0]).toMatchObject({ role: 'task', done: true, color: 3, icon: '🔥' })
    expect(payload.nodes[1]).toEqual({ id: 'b', title: 'B' })
    expect(payload.links).toEqual([{ from: 'a', to: 'b', label: 'blocks' }])
    const fresh = withFreshIds(payload)
    expect(fresh.links[0].label).toBe('blocks')
    expect(fresh.links[0].from).toBe(fresh.nodes[0].id)
  })
})
