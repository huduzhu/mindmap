// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateValidatorsSource, OUTPUT } from '../../scripts/build-validators.mjs'

describe('precompiled schema validators (#181)', () => {
  it('match the schemas: run `npm run validators` after changing one', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(generateValidatorsSource())
  })

  it('need no code compiled at run time', () => {
    const source = readFileSync(OUTPUT, 'utf8')
    expect(source).not.toMatch(/new Function|\beval\(|require\(/)
  })
})
