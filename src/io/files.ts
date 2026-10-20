export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }))
}

export function downloadJson(filename: string, doc: unknown) {
  downloadText(filename, `${JSON.stringify(doc, null, 2)}\n`)
}

const MAX_SLUG_CHARS = 80

/**
 * A filename-safe version of a project name. Unicode letters, marks and digits
 * are kept — the old ASCII-only rule turned every CJK name into "mindmap", so
 * all exports collided in the Downloads folder (#51). Everything else (spaces,
 * punctuation, path separators, Windows-reserved characters) becomes "-".
 * A name with no letters or digits falls back to a timestamped "mindmap-…".
 */
export function slugify(name: string, now: Date = new Date()): string {
  const slug = Array.from(
    name
      .normalize('NFC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, ''),
  )
    .slice(0, MAX_SLUG_CHARS)
    .join('')
    .replace(/-+$/, '')
  if (slug) return slug
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `mindmap-${stamp}`
}

const PICK_GRACE_MS = 400
const PICK_TIMEOUT_MS = 10 * 60 * 1000

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    let settled = false
    let grace: ReturnType<typeof setTimeout> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    const settle = (file: File | null) => {
      if (settled) return
      settled = true
      clearTimeout(grace)
      clearTimeout(timeout)
      input.remove()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      resolve(file)
    }
    const onFocus = () => {
      // The dialog closed without a selection; give `change` a brief grace
      // period in case it fires right after focus returns.
      grace = setTimeout(() => settle(null), PICK_GRACE_MS)
    }
    const onBlur = () => {
      // Only once the window has blurred (the dialog actually opened) does a
      // returning focus mean the user cancelled — before that, focus events
      // are unrelated to the picker.
      window.addEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
    input.addEventListener('change', () => settle(input.files?.[0] ?? null))
    window.addEventListener('blur', onBlur)
    timeout = setTimeout(() => settle(null), PICK_TIMEOUT_MS)
    document.body.appendChild(input)
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
      } catch {
        input.click()
      }
    } else {
      input.click()
    }
  })
}
