// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  basePath,
  metaContentSecurityPolicy,
  readMetaContentSecurityPolicy,
} from '../../scripts/site-config.mjs'

describe('Content-Security-Policy meta tag', () => {
  it('takes the policy from _headers without header-only directives', () => {
    const headers = [
      '# comment',
      '/*',
      "  Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; object-src 'none'",
      '  X-Content-Type-Options: nosniff',
    ].join('\n')
    expect(metaContentSecurityPolicy(headers)).toBe("default-src 'self'; object-src 'none'")
    expect(() => metaContentSecurityPolicy('/*\n  X-Frame-Options: DENY')).toThrow()
  })

  it('the real policy keeps scripts, objects and the base URL locked down', () => {
    const policy = readMetaContentSecurityPolicy()
    expect(policy).toContain("default-src 'self'")
    // No 'unsafe-eval' since the schemas are precompiled (#181).
    expect(policy).toMatch(/script-src 'self';/)
    expect(policy).not.toContain('unsafe-eval')
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'none'")
    expect(policy).toContain('https://api.github.com')
    expect(policy).not.toContain('frame-ancestors')
  })
})

describe('base path (BASE_PATH)', () => {
  it('defaults to the site root', () => {
    expect(basePath(undefined)).toBe('/')
    expect(basePath('')).toBe('/')
    expect(basePath(' / ')).toBe('/')
  })

  it('normalises a sub-path to /path/', () => {
    expect(basePath('/mindmap/')).toBe('/mindmap/')
    expect(basePath('mindmap')).toBe('/mindmap/')
    expect(basePath('/mindmap')).toBe('/mindmap/')
    expect(basePath('//apps//mindmap//')).toBe('/apps/mindmap/')
  })

  it('refuses anything that is not a plain path', () => {
    for (const bad of ['../x', '/a/./b', 'https://example.com/', '/a?b', '/a#b', '/a b', 'a\\b'])
      expect(() => basePath(bad)).toThrow(/BASE_PATH/)
  })
})
