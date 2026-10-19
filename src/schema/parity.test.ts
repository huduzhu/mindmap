// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateDoc, KIND_TO_SCHEMA as TS_MAP } from './validate'
import {
  KIND_TO_SCHEMA as SCRIPT_MAP,
  validateDoc as scriptValidateDoc,
} from '../../scripts/validate.mjs'
import presetSchema from '../../schemas/preset.schema.json'
import projectSchema from '../../schemas/project.schema.json'
import templateSchema from '../../schemas/template.schema.json'
import packetSchema from '../../schemas/packet.schema.json'
import treeNodeSchema from '../../schemas/tree-node.schema.json'

function walkSchema(schema: any, callback: (key: string, val: any) => void) {
  if (schema && typeof schema === 'object') {
    for (const key of Object.keys(schema)) {
      callback(key, schema[key])
      walkSchema(schema[key], callback)
    }
  }
}

interface Doc {
  rel: string
  doc: unknown
}

function listDocs(root: string): Doc[] {
  const dir = path.resolve(process.cwd(), root)
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      rel: path.posix.join(root, f),
      doc: JSON.parse(readFileSync(path.join(dir, f), 'utf8')),
    }))
}

const VALID_DIRS = ['fixtures/valid', 'fixtures/golden', 'presets']
const INVALID_DIRS = ['fixtures/invalid']

describe('schema parity and hygiene', () => {
  it('schemas contain no format key (ajv-formats is unused)', () => {
    const schemas = [presetSchema, projectSchema, templateSchema, packetSchema, treeNodeSchema]
    for (const schema of schemas) {
      walkSchema(schema, (key) => {
        expect(key).not.toBe('format')
      })
    }
  })

  it('both validators register the same kind → schema map', () => {
    expect(TS_MAP).toEqual(SCRIPT_MAP)
  })

  it('both validators agree on every fixture, golden, invalid doc, and built-in preset', () => {
    const docs = [...VALID_DIRS, ...INVALID_DIRS].flatMap(listDocs)
    expect(docs).toHaveLength(22)
    for (const { rel, doc } of docs) {
      const ts = validateDoc(doc)
      const script = scriptValidateDoc(doc)
      expect({ file: rel, ts: ts.ok, script: script.ok }).toEqual({
        file: rel,
        ts: script.ok,
        script: script.ok,
      })
    }
  })

  it('every valid, golden, and preset doc validates; every invalid doc is rejected', () => {
    for (const root of VALID_DIRS) {
      for (const { rel, doc } of listDocs(root)) {
        expect(validateDoc(doc).ok, `expected valid: ${rel}`).toBe(true)
        expect(scriptValidateDoc(doc).ok, `expected valid (script): ${rel}`).toBe(true)
      }
    }
    for (const root of INVALID_DIRS) {
      for (const { rel, doc } of listDocs(root)) {
        expect(validateDoc(doc).ok, `expected invalid: ${rel}`).toBe(false)
        expect(scriptValidateDoc(doc).ok, `expected invalid (script): ${rel}`).toBe(false)
      }
    }
  })

  it('validates a standard project fixture', () => {
    const validProject = {
      kind: 'project',
      schemaVersion: 1,
      name: 'Test Project',
      preset: 'default',
      brainstorm: { id: 'b', title: 'Brainstorm', children: [] },
      map: { id: 'm', title: 'Map', children: [{ id: 'm2', title: 'Child', children: [] }] },
      links: [{ from: 'm', to: 'm2' }],
    }
    const res = validateDoc(validProject)
    expect(res.ok).toBe(true)
    expect(res.errors).toHaveLength(0)
  })

  it('accepts optional project organization metadata and rejects blank tags', () => {
    const valid = validateDoc({
      kind: 'project',
      schemaVersion: 1,
      name: 'Tagged',
      preset: 'default',
      brainstorm: { id: 'b', title: 'Brainstorm', children: [] },
      map: { id: 'm', title: 'Map', children: [] },
      pinned: true,
      tags: ['Planning'],
    })
    expect(valid.ok).toBe(true)
    const invalid = validateDoc({
      kind: 'project',
      schemaVersion: 1,
      name: 'Tagged',
      preset: 'default',
      brainstorm: { id: 'b', title: 'Brainstorm', children: [] },
      map: { id: 'm', title: 'Map', children: [] },
      tags: ['   '],
    })
    expect(invalid.ok).toBe(false)
  })

  it('fails on missing kind', () => {
    const doc = { schemaVersion: 1 }
    const res = validateDoc(doc)
    expect(res.ok).toBe(false)
    expect(res.errors[0].message).toContain('unknown or missing kind')
  })
})
describe('strict schema authoring (#59)', () => {
  it('both validators use identical Ajv options', async () => {
    const { AJV_OPTIONS: TS_OPTIONS } = await import('./validate')
    const { AJV_OPTIONS: SCRIPT_OPTIONS } = await import('../../scripts/validate.mjs')
    expect(SCRIPT_OPTIONS).toEqual(TS_OPTIONS)
  })

  it('a misspelled keyword fails compilation instead of being ignored', async () => {
    const { default: Ajv2020 } = await import('ajv/dist/2020')
    const { AJV_OPTIONS } = await import('./validate')
    const ajv = new Ajv2020(AJV_OPTIONS)
    expect(() => ajv.compile({ type: 'string', maxLenght: 3 })).toThrow(/unknown keyword/)
  })

  it('the script validator registers every schemas/*.schema.json', async () => {
    const { schemaFiles } = await import('../../scripts/validate.mjs')
    const onDisk = readdirSync(path.resolve(process.cwd(), 'schemas')).filter((f) =>
      f.endsWith('.schema.json'),
    )
    expect(schemaFiles()).toEqual(onDisk.sort())
  })
})
