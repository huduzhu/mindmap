import type { Preset, Project } from '../schema/types'
import { useLocale } from '../i18n'
import { blobBytes, collectAssetRefs, getAsset } from '../assets/store'

/** A Blob as a `data:` URI. */
export async function dataUri(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blobBytes(blob))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

/**
 * The pictures the page shows (#149, HC9), as base64 data URIs by asset
 * hash, so the HTML stays one self-contained file. Only the map's images
 * (the page shows the map); one missing here is left out and the page shows
 * its placeholder.
 */
export async function embeddedImages(project: Project): Promise<Record<string, string>> {
  const images: Record<string, string> = {}
  for (const hash of collectAssetRefs([project.map])) {
    const blob = await getAsset(hash).catch(() => null)
    if (blob) images[hash] = await dataUri(blob)
  }
  return images
}

/**
 * The exported page needs nothing outside itself (#224): its script and
 * stylesheet are inline and its pictures are data: URIs. This policy lets
 * only those run or load, so the file cannot fetch, send or frame anything.
 */
export const EXPORT_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${EXPORT_CONTENT_SECURITY_POLICY}" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>__MMS_TITLE__</title>
<style>
__MMS_CSS__
</style>
</head>
<body>
<div id="mms-root"></div>
<script>
window.__MMS_DATA__ = __MMS_DATA_JSON__;
</script>
<script>
__MMS_JS__
</script>
</body>
</html>
`

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Escape for embedding inside a <script> block: a raw "<" could close the tag
// (e.g. "</script>" inside a node title), and U+2028/29 are line terminators
// in JS but legal inside JSON strings.
function escapeScriptJson(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

// The viewer bundle and stylesheet are inlined raw. A literal "</script" in the
// JS or "</style" in the CSS (from any dependency) would end the block early and
// corrupt every export (#67). "<\/" is equivalent inside JS strings, regexes
// and comments, and "\/" is a no-op escape in CSS.
export function escapeInlineScript(js: string): string {
  return js.replace(/<\/(script)/gi, '<\\/$1')
}

export function escapeInlineStyle(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1')
}

// Split on the exact placeholder tokens once each, then join positionally —
// fills never go through String.replace, so "$&" sequences and token-looking
// user text are treated as literals instead of back-references or extra slots.
// `window.__MMS_DATA__` (a runtime global, not a placeholder) must survive.
const SLOTS = ['__MMS_TITLE__', '__MMS_CSS__', '__MMS_DATA_JSON__', '__MMS_JS__'] as const
const TEMPLATE_PARTS = TEMPLATE.split(new RegExp(SLOTS.join('|'), 'g'))

/**
 * Only what the page shows (#176): the map, its links and the name. The
 * Brainstorm tree, project tags and bookkeeping fields stay out of the file,
 * where View Source would reveal them.
 */
export function viewerProject(project: Project): Project {
  return {
    kind: 'project',
    schemaVersion: project.schemaVersion,
    name: project.name,
    preset: project.preset,
    map: project.map,
    ...(project.links?.length ? { links: project.links } : {}),
    brainstorm: { id: project.brainstorm.id, title: '' },
  }
}

export async function buildInteractiveHtml(project: Project, preset: Preset): Promise<string> {
  // Exactly one occurrence per slot: any leftover or duplicated placeholder
  // changes the part count, so this guards the positional join below.
  if (TEMPLATE_PARTS.length !== SLOTS.length + 1) {
    throw new Error(
      `html export template has ${TEMPLATE_PARTS.length - 1} __MMS_*__ slots, expected ${SLOTS.length}`,
    )
  }
  const base = import.meta.env.BASE_URL ?? '/'
  const [jsRes, cssRes] = await Promise.all([
    fetch(`${base}viewer/viewer.iife.js`),
    fetch(`${base}viewer/viewer.css`),
  ])
  if (!jsRes.ok || !cssRes.ok) {
    throw new Error(
      'viewer assets are missing — run `npm run viewer` (or restart `npm run dev`, which builds them)',
    )
  }
  const js = await jsRes.text()
  const css = await cssRes.text()
  const images = await embeddedImages(project)
  const dataJson = escapeScriptJson(
    JSON.stringify({
      project: viewerProject(project),
      preset,
      locale: useLocale.getState().locale,
      ...(Object.keys(images).length > 0 ? { images } : {}),
    }),
  )
  const fills = [escapeHtml(project.name), escapeInlineStyle(css), dataJson, escapeInlineScript(js)]
  let html = TEMPLATE_PARTS[0]
  for (let i = 0; i < fills.length; i += 1) {
    html += fills[i] + TEMPLATE_PARTS[i + 1]
  }
  return html
}
