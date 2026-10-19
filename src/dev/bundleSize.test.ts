// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUDGET_KB,
  initialChunks,
  measure,
  sizeColumns,
} from '../../scripts/check-bundle-size.mjs'

describe('bundle budget (#88)', () => {
  it('counts the entry and its static imports, not the lazy chunks', () => {
    const manifest = {
      'index.html': {
        file: 'assets/index-a.js',
        isEntry: true,
        imports: ['_vendor'],
        dynamicImports: ['src/io/exporters.ts'],
      },
      _vendor: { file: 'assets/vendor-b.js', imports: ['_shared'] },
      _shared: { file: 'assets/shared-c.js' },
      'src/io/exporters.ts': { file: 'assets/exporters-d.js', imports: ['_shared'] },
      'src/index.css': { file: 'assets/index-e.css' },
    }
    const { initial, lazy } = initialChunks(manifest)
    expect(initial.sort()).toEqual([
      'assets/index-a.js',
      'assets/shared-c.js',
      'assets/vendor-b.js',
    ])
    expect(lazy).toEqual(['assets/exporters-d.js'])
    expect(DEFAULT_BUDGET_KB).toBeGreaterThan(0)
  })

  it('refuses a manifest without an entry', () => {
    expect(() => initialChunks({ a: { file: 'a.js' } })).toThrow(/entry/)
  })

  it('measures raw and gzip bytes, and prints raw first (H0-3)', () => {
    const contents = Buffer.from('const message = "hello";\n'.repeat(200))
    const { raw, gzip } = measure(contents)
    expect(raw).toBe(contents.length)
    expect(gzip).toBeLessThan(raw / 10)
    expect(sizeColumns({ raw: 2048, gzip: 512 })).toBe('    2.0 KB raw     0.5 KB gzip')
  })
})
