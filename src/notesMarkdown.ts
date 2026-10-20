function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Render the deliberately small, safe markdown subset used by node notes. */
export function renderNotesMarkdown(text: string): string {
  const escaped = escapeHtml(text).replace(/\r\n?/g, '\n')
  if (!escaped) return ''

  return escaped
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${renderInline(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

function renderInline(text: string): string {
  const tokens: string[] = []
  const tokenStart = '\uE000'
  const tokenEnd = '\uE001'
  const stash = (html: string) => {
    const marker = `${tokenStart}${tokens.length}${tokenEnd}`
    tokens.push(html)
    return marker
  }

  let rendered = text
    // Code is stashed before other formatting so its contents stay literal.
    .replace(/`([^`\n]*)`/g, (_match, code: string) => stash(`<code>${code}</code>`))
    // Only http(s) URLs become links. Other schemes remain escaped markdown text.
    // The label excludes "[" too, so the scan is linear: with "[^\]\n]+" a long
    // run of "[" made every start position rescan to the end (ReDoS).
    .replace(/\[([^[\]\n]+)\]\((https?:\/\/[^\s()]+)\)/gi, (_match, label: string, url: string) =>
      // A new tab, so following a link never navigates the app itself away (#93).
      stash(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`),
    )
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')

  return rendered.replace(
    new RegExp(`${tokenStart}(\\d+)${tokenEnd}`, 'g'),
    // A note can contain the sentinel characters itself; leave such text as-is
    // instead of rendering "undefined" (#65).
    (match, index: string) => tokens[Number(index)] ?? match,
  )
}
