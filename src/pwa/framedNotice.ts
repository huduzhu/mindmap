/**
 * Shown instead of the app inside another site's frame (#180). Loaded only
 * then, so it costs the normal start nothing.
 */
export function renderFramedNotice(root: HTMLElement, href: string = location.href): void {
  const box = document.createElement('main')
  box.className = 'framed-notice'
  const text = document.createElement('p')
  text.textContent =
    'Mind Map Studio does not run inside another page. · Mind Map Studio 不能在其他网页中运行。'
  const link = document.createElement('a')
  link.href = href
  link.target = '_top'
  link.rel = 'noopener'
  link.textContent = 'Open it in its own tab · 在新标签页中打开'
  box.append(text, link)
  root.replaceChildren(box)
}
