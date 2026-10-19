#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export const KIND_TO_SCHEMA = {
  preset: 'preset.schema.json',
  project: 'project.schema.json',
  template: 'template.schema.json',
  'analysis-request': 'packet.schema.json',
  'brainstorm-update': 'brainstorm-update.schema.json',
}

let cached = null

/**
 * Strict schema-authoring checks: a misspelled keyword (`maxLenght`, `requird`)
 * now fails at startup instead of being silently ignored while the gate
 * reports PASS (#59). `strictRequired` stays off because the packet schema's
 * if/then branches deliberately require properties defined at the top level.
 * Keep in lock-step with src/schema/validate.ts (asserted by parity.test.ts).
 */
export const AJV_OPTIONS = {
  allErrors: true,
  strictSchema: true,
  strictNumbers: true,
  strictTypes: true,
  strictTuples: true,
  strictRequired: false,
}

/** Every schemas/*.schema.json, so a newly added schema is registered automatically. */
export function schemaFiles(root = ROOT) {
  return readdirSync(path.join(root, 'schemas'))
    .filter((name) => name.endsWith('.schema.json'))
    .sort()
}

export function createValidator() {
  if (cached) return cached
  const ajv = new Ajv2020(AJV_OPTIONS)
  for (const name of schemaFiles()) {
    const schema = JSON.parse(readFileSync(path.join(ROOT, 'schemas', name), 'utf8'))
    ajv.addSchema(schema)
  }
  // Compile everything up front so an authoring error fails every run.
  for (const id of Object.values(KIND_TO_SCHEMA)) ajv.getSchema(id)
  cached = (doc) => {
    const kind = doc && typeof doc === 'object' ? doc.kind : undefined
    const schemaId = KIND_TO_SCHEMA[kind]
    if (!schemaId) {
      return {
        ok: false,
        errors: [{ message: `unknown or missing kind: ${JSON.stringify(kind)}` }],
      }
    }
    const validate = ajv.getSchema(schemaId)
    if (!validate) {
      return { ok: false, errors: [{ message: `no schema registered for kind: ${kind}` }] }
    }
    const ok = validate(doc)
    return { ok: Boolean(ok), errors: ok ? [] : [...(validate.errors ?? [])] }
  }
  return cached
}

export function validateDoc(doc) {
  return createValidator()(doc)
}

export function validateFile(file) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    return { ok: false, readError: true, errors: [{ message: `cannot read file: ${err.message}` }] }
  }
  let doc
  try {
    doc = JSON.parse(raw)
  } catch (err) {
    return { ok: false, errors: [{ message: `invalid JSON: ${err.message}` }] }
  }
  return validateDoc(doc)
}

function formatErrors(errors) {
  return errors.map((e) => `  - ${e.instancePath || '(root)'}: ${e.message}`).join('\n')
}

/**
 * Expand `*` / `?` in the file-name part of an argument. cmd.exe and
 * PowerShell pass globs through literally, so the documented
 * `node scripts/validate.mjs examples/*.json` failed with ENOENT on Windows (#69).
 * Arguments without wildcards are returned untouched.
 */
export function expandArgs(args, cwd = process.cwd()) {
  const out = []
  for (const arg of args) {
    const base = path.basename(arg)
    if (!/[*?]/.test(base)) {
      out.push(arg)
      continue
    }
    const dir = path.dirname(arg)
    const pattern = new RegExp(
      `^${base
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`,
    )
    let names = []
    try {
      names = readdirSync(path.resolve(cwd, dir))
    } catch {
      names = []
    }
    const matches = names.filter((name) => pattern.test(name)).sort()
    if (matches.length === 0) out.push(arg)
    else out.push(...matches.map((name) => path.join(dir, name)))
  }
  return out
}

// Exit codes: 0 all valid, 1 at least one schema failure, 2 usage or read error
// (matching scripts/repair-llm-output.mjs).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = expandArgs(process.argv.slice(2))
  if (files.length === 0) {
    console.error('usage: node scripts/validate.mjs <file.json> [more.json ...]')
    process.exit(2)
  }
  let failed = 0
  let unreadable = 0
  for (const file of files) {
    const result = validateFile(file)
    if (result.ok) {
      console.log(`PASS  ${file}`)
    } else if (result.readError) {
      unreadable += 1
      console.log(`ERROR ${file}\n${formatErrors(result.errors)}`)
    } else {
      failed += 1
      console.log(`FAIL  ${file}\n${formatErrors(result.errors)}`)
    }
  }
  process.exit(unreadable > 0 ? 2 : failed > 0 ? 1 : 0)
}
