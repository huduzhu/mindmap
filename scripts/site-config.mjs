// Build-time settings shared by vite.config.ts and its tests: the base path the
// app is served from, and the Content-Security-Policy <meta> tag, read from
// public/_headers so the two can never disagree.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** Directives a <meta> CSP cannot carry; browsers ignore them there with a warning. */
const HEADER_ONLY = ['frame-ancestors', 'report-uri', 'sandbox']

/**
 * The Content-Security-Policy of a `_headers` file, without the directives
 * that only work as a real header.
 */
export function metaContentSecurityPolicy(headersText) {
  const line = headersText
    .split(/\r?\n/)
    .map((text) => text.trim())
    .find((text) => text.startsWith('Content-Security-Policy:'))
  if (!line) throw new Error('public/_headers has no Content-Security-Policy line')
  return line
    .slice('Content-Security-Policy:'.length)
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive && !HEADER_ONLY.includes(directive.split(/\s+/)[0]))
    .join('; ')
}

/** The policy for index.html's <meta> tag, from public/_headers. */
export function readMetaContentSecurityPolicy(root = ROOT) {
  return metaContentSecurityPolicy(readFileSync(path.join(root, 'public', '_headers'), 'utf8'))
}

/**
 * Vite's `base` from the BASE_PATH environment variable: "/" (the site root)
 * when unset, otherwise an absolute path with leading and trailing slashes, so
 * "mindmap" and "/mindmap" both give "/mindmap/" (a GitHub Pages project site).
 * The service worker scope, the manifest and every asset URL follow it.
 */
export function basePath(value) {
  const trimmed = (value ?? '').trim()
  if (!trimmed || trimmed === '/') return '/'
  const segments = trimmed.split('/').filter((segment) => segment !== '')
  const unsafe = segments.some(
    (segment) => segment === '.' || segment === '..' || /[?#\\:\s]/.test(segment),
  )
  if (unsafe) throw new Error(`BASE_PATH must be a plain path such as /mindmap/, not ${value}`)
  return `/${segments.join('/')}/`
}
