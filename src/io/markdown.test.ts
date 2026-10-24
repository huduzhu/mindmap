import { describe, expect, it } from 'vitest'
import { t } from '../i18n'
import type { TreeNode } from '../schema/types'
import { exportToMarkdown, flattenTitle, parseMarkdown } from './markdown'

function titles(tree: TreeNode): string[] {
  const out: string[] = [tree.title]
  for (const child of tree.children ?? []) out.push(...titles(child))
  return out
}

function shape(tree: TreeNode): unknown {
  return {
    title: tree.title,
    children: (tree.children ?? []).map(shape),
  }
}

describe('markdown round-trip', () => {
  it('exports bullets indented by depth and re-imports the same shape', () => {
    const root: TreeNode = {
      id: 'r',
      title: 'Trip ideas',
      children: [
        { id: 'a', title: 'Beach day', children: [{ id: 'a1', title: 'Snorkeling' }] },
        { id: 'b', title: 'City tour' },
      ],
    }
    const markdown = exportToMarkdown(root)
    expect(markdown).toContain('# Trip ideas')
    expect(markdown).toContain('  - Beach day')
    expect(markdown).toContain('    - Snorkeling')

    const parsed = parseMarkdown(markdown)
    expect(shape(parsed)).toEqual(shape(root))
    expect(titles(parsed)).toEqual(['Trip ideas', 'Beach day', 'Snorkeling', 'City tour'])
  })

  it('uses the first heading as the root title', () => {
    const parsed = parseMarkdown('# My outline\n\n- one\n- two\n')
    expect(parsed.title).toBe('My outline')
    expect(parsed.children).toHaveLength(2)
  })

  it('clamps over-deep jumps under the previous bullet', () => {
    const parsed = parseMarkdown('# T\n- a\n      - deep\n')
    const a = parsed.children![0]
    expect(a.title).toBe('a')
    expect(a.children![0].title).toBe('deep')
  })

  it('ignores non-bullet lines', () => {
    const parsed = parseMarkdown('# T\nsome prose\n- only bullet\nmore prose\n')
    expect(parsed.children).toHaveLength(1)
    expect(parsed.children![0].title).toBe('only bullet')
  })

  it('returns a bare root when there are no bullets', () => {
    const parsed = parseMarkdown('# Empty\nno bullets here\n')
    expect(parsed.title).toBe('Empty')
    expect(parsed.children ?? []).toHaveLength(0)
  })

  it('flattens newlines in titles so the outline stays one bullet per line', () => {
    const root: TreeNode = {
      id: 'r',
      title: 'Trip\r\nideas',
      children: [
        { id: 'a', title: 'Beach\nday', children: [] },
        { id: 'b', title: 'Multi\r\nline\n  note', children: [] },
      ],
    }
    const markdown = exportToMarkdown(root)
    expect(markdown).toContain('# Trip ideas')
    expect(markdown).toContain('- Beach day')
    expect(markdown).toContain('- Multi line note')
    // Every line is either the heading, blank, or a single bullet.
    for (const line of markdown.split('\n')) {
      expect(line).toMatch(/^(# .*|\s*- .*|)$/)
    }

    const parsed = parseMarkdown(markdown)
    expect(titles(parsed)).toEqual(['Trip ideas', 'Beach day', 'Multi line note'])
  })

  it('round-trips notes as indented blockquotes (#52)', () => {
    const root: TreeNode = {
      id: 'r',
      title: 'Plan',
      notes: 'About the plan',
      children: [
        {
          id: 'a',
          title: 'Phase 1',
          notes: 'First line\n\n- not a bullet\n  indented',
          children: [{ id: 'a1', title: 'Kickoff', notes: 'Monday' }],
        },
        { id: 'b', title: 'Phase 2' },
      ],
    }
    const markdown = exportToMarkdown(root)
    expect(markdown).toContain('> About the plan')
    expect(markdown).toContain('    > First line')
    expect(markdown).toContain('    > - not a bullet')

    const parsed = parseMarkdown(markdown)
    expect(shape(parsed)).toEqual(shape(root))
    expect(parsed.notes).toBe('About the plan')
    expect(parsed.children![0].notes).toBe('First line\n\n- not a bullet\n  indented')
    expect(parsed.children![0].children![0].notes).toBe('Monday')
    expect(parsed.children![1].notes).toBeUndefined()
  })
})

describe('markdown round-trip keeps every node', () => {
  it('treats a lone carriage return as a line break in titles and notes', () => {
    const root: TreeNode = {
      id: 'r',
      title: 'Plan',
      children: [
        {
          id: 'a',
          title: 'Old\rMac',
          notes: 'one\rtwo',
          children: [{ id: 'a1', title: 'Child' }],
        },
        { id: 'b', title: 'After' },
      ],
    }
    const markdown = exportToMarkdown(root)
    expect(markdown).not.toContain('\r')
    const parsed = parseMarkdown(markdown)
    expect(titles(parsed)).toEqual(['Plan', 'Old Mac', 'Child', 'After'])
    expect(parsed.children![0].notes).toBe('one\ntwo')
    expect(parsed.children![0].children![0].title).toBe('Child')
  })

  it('writes an untitled child as "Untitled" so it and its children come back', () => {
    const root: TreeNode = {
      id: 'r',
      title: 'Plan',
      children: [
        {
          id: 'a',
          title: '',
          children: [{ id: 'a1', title: '  ', children: [{ id: 'a2', title: 'Deep' }] }],
        },
        { id: 'b', title: 'Sibling' },
      ],
    }
    const parsed = parseMarkdown(exportToMarkdown(root))
    expect(shape(parsed)).toEqual({
      title: 'Plan',
      children: [
        {
          title: 'Untitled',
          children: [{ title: 'Untitled', children: [{ title: 'Deep', children: [] }] }],
        },
        { title: 'Sibling', children: [] },
      ],
    })
  })

  it('does not take an empty heading as the root title', () => {
    const parsed = parseMarkdown('#   \n- one\n')
    expect(parsed.title).toBe(t('import.outlineRoot'))
    expect(parsed.children?.map((child) => child.title)).toEqual(['one'])
  })
})

describe('images in Markdown (#149)', () => {
  const asset = `sha256-${'d'.repeat(64)}`
  const root: TreeNode = {
    id: 'r',
    title: 'Kitchen',
    image: { asset, w: 100, h: 50 },
    children: [
      {
        id: 'a',
        title: 'Bench',
        notes: 'Stone',
        image: { asset, w: 100, h: 50, alt: 'Grey [quartz] top' },
        children: [{ id: 'a1', title: 'Edge' }],
      },
    ],
  }

  it('writes the description in brackets, and reads back the same outline', () => {
    const markdown = exportToMarkdown(root)
    expect(markdown).toContain('# Kitchen\n\n[image]\n')
    expect(markdown).toContain('  - Bench\n    [image: Grey [quartz] top]\n    > Stone\n    - Edge')
    const back = parseMarkdown(markdown)
    expect(shape(back)).toEqual(shape(root))
    expect(back.children?.[0].notes).toBe('Stone')
  })

  it('links the image files of a ZIP export', () => {
    const markdown = exportToMarkdown(root, {
      imagePaths: new Map([[asset, `images/${asset}.webp`]]),
    })
    expect(markdown).toContain(`# Kitchen\n\n![](images/${asset}.webp)\n`)
    expect(markdown).toContain(`    ![Grey \\[quartz\\] top](images/${asset}.webp)`)
    expect(shape(parseMarkdown(markdown))).toEqual(shape(root))
  })
})

describe('long whitespace runs (ReDoS)', () => {
  const spaces = ' '.repeat(200_000)

  it('flattens line breaks like before, without backtracking on long runs', () => {
    expect(flattenTitle('a \r\n \n b')).toBe('a b')
    expect(flattenTitle('\n\n a')).toBe(' a')
    expect(flattenTitle('a\n')).toBe('a ')
    const started = performance.now()
    expect(flattenTitle(`x${spaces}x`)).toBe(`x${spaces}x`)
    expect(flattenTitle(`x${spaces}\n`)).toBe('x ')
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('parses a quote line with a long run of trailing-looking spaces quickly', () => {
    const started = performance.now()
    const root = parseMarkdown(`# T\n- A\n  > x${spaces}x\n  > y${spaces}`)
    expect(performance.now() - started).toBeLessThan(500)
    expect(root.children?.[0].notes).toBe(`x${spaces}x\ny`)
  })

  it('exports notes and titles with long space runs quickly', () => {
    const root: TreeNode = {
      id: 'r',
      title: `T${spaces}T`,
      children: [{ id: 'a', title: 'A', notes: `n${spaces}n${spaces}` }],
    }
    const started = performance.now()
    const markdown = exportToMarkdown(root)
    expect(performance.now() - started).toBeLessThan(500)
    expect(markdown).toContain(`> n${spaces}n\n`)
  })
})
