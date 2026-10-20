import { describe, expect, it } from 'vitest'
import { renderNotesMarkdown } from './notesMarkdown'

describe('renderNotesMarkdown', () => {
  it('escapes HTML before rendering markdown', () => {
    expect(renderNotesMarkdown('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    )
  })

  it('rejects javascript links while allowing http(s) links', () => {
    const html = renderNotesMarkdown(
      '[bad](javascript:alert(1)) [good](https://example.com/a?b=1&c=2)',
    )
    expect(html).toContain('[bad](javascript:alert(1))')
    expect(html).toContain(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">good</a>',
    )
    expect(html).not.toContain('<a href="javascript:')
  })

  it('renders the supported inline formatting', () => {
    expect(renderNotesMarkdown('**bold** *italic* `code` [link](http://example.com)')).toBe(
      '<p><strong>bold</strong> <em>italic</em> <code>code</code> <a href="http://example.com" target="_blank" rel="noopener noreferrer">link</a></p>',
    )
  })

  it('renders paragraphs and line breaks', () => {
    expect(renderNotesMarkdown('one\ntwo\n\nthree')).toBe('<p>one<br />two</p><p>three</p>')
  })

  it('leaves sentinel-looking text alone instead of rendering "undefined" (#65)', () => {
    const html = renderNotesMarkdown('before \uE00099\uE001 after')
    expect(html).not.toContain('undefined')
    expect(html).toContain('99')
  })

  it('renders long runs of brackets in linear time (ReDoS)', () => {
    const started = performance.now()
    for (const input of ['['.repeat(100_000), '[a'.repeat(50_000), '[a]('.repeat(25_000)]) {
      renderNotesMarkdown(input)
    }
    expect(performance.now() - started).toBeLessThan(500)
    expect(renderNotesMarkdown('[[x](https://a.example)')).toBe(
      '<p>[<a href="https://a.example" target="_blank" rel="noopener noreferrer">x</a></p>',
    )
  })
})
