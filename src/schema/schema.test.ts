// @vitest-environment node

import path from 'node:path'
import { validateDoc, validateFile } from '../../scripts/validate.mjs'

const fixture = (rel: string) => path.resolve(process.cwd(), rel)

test('valid project fixture passes', () => {
  expect(validateFile(fixture('fixtures/valid/project-launch.json')).ok).toBe(true)
})

test('valid template fixture passes', () => {
  expect(validateFile(fixture('fixtures/valid/template-weekly-review.json')).ok).toBe(true)
})

test('all valid packet fixtures pass', () => {
  for (const name of ['packet-expand', 'packet-convert', 'packet-improve']) {
    expect(validateFile(fixture(`fixtures/valid/${name}.json`)).ok).toBe(true)
  }
})

test('all starter presets pass', () => {
  for (const name of ['colorblind-safe', 'corporate', 'dark', 'default', 'handdrawn']) {
    expect(validateFile(fixture(`presets/${name}.json`)).ok).toBe(true)
  }
})

test('invalid fixtures are rejected', () => {
  for (const name of ['bad-role', 'missing-kind', 'bad-hex']) {
    expect(validateFile(fixture(`fixtures/invalid/${name}.json`)).ok).toBe(false)
  }
})

test('unknown kind is rejected with an error', () => {
  const result = validateDoc({ kind: 'spaceship', schemaVersion: 1 })
  expect(result.ok).toBe(false)
  expect(result.errors[0].message).toMatch(/unknown or missing kind/)
})

test('convert packet without brainstorm payload is rejected', () => {
  const result = validateDoc({
    kind: 'analysis-request',
    schemaVersion: 1,
    projectName: 'x',
    intent: 'convert',
    depth: 'titles',
    preset: 'default',
    payload: { map: { id: 'm', title: 'Map' } },
    instructions: { goal: 'convert', rules: ['r'] },
  })
  expect(result.ok).toBe(false)
})
