// @vitest-environment node

import { buildViteArgs, resolvePort } from '../../scripts/start-dev.mjs'

test('defaults to port 5173', () => {
  expect(resolvePort({})).toBe(5173)
})

test('default args use port 5173 and strict port mode', () => {
  expect(buildViteArgs({})).toEqual(['--port', '5173', '--strictPort'])
})

test('uses MMS_DEV_PORT when set', () => {
  const env = { MMS_DEV_PORT: '4000' }
  expect(resolvePort(env)).toBe(4000)
  expect(buildViteArgs(env)).toEqual(['--port', '4000', '--strictPort'])
})

test('rejects a non-numeric MMS_DEV_PORT', () => {
  expect(() => resolvePort({ MMS_DEV_PORT: 'not-a-port' })).toThrow(
    /MMS_DEV_PORT.*positive integer/,
  )
})

test('default args do not include port 5174', () => {
  expect(buildViteArgs({})).not.toContain('5174')
})
