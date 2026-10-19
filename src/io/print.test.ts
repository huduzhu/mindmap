import { describe, expect, it } from 'vitest'
import { makeTree } from '../test/fixtures'
import { outlineHtml } from './print'

describe('outlineHtml (#106)', () => {
  it('prints the tree as nested lists with notes, escaping titles', () => {
    const html = outlineHtml(
      makeTree('r', 'Plan <v2>', [
        makeTree('a', 'Research & scope', [makeTree('a1', 'Interviews')], {
          notes: '**Five** users',
        }),
        makeTree('b', 'Build'),
      ]),
    )
    expect(html).toBe(
      '<h1>Plan &lt;v2&gt;</h1><ul>' +
        '<li><span class="title">Research &amp; scope</span>' +
        '<div class="notes"><p><strong>Five</strong> users</p></div>' +
        '<ul><li><span class="title">Interviews</span></li></ul></li>' +
        '<li><span class="title">Build</span></li></ul>',
    )
  })

  it('prints a lone root without an empty list', () => {
    expect(outlineHtml(makeTree('r', 'Only'))).toBe('<h1>Only</h1>')
  })
})
