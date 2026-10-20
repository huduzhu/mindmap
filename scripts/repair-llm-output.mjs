#!/usr/bin/env node
// Repair a skill's JSON output at the skill boundary (#30, Candidate A).
//
// skill/SKILL.md already mandates `node scripts/validate.mjs` before handoff, but
// a run that skips it — or that simply forgets the wrapper — reaches the user as a
// failed import. This fills the same wrapper fields the importer would, prints
// exactly what it filled, and re-validates, so the problem is visible in the
// skill's own output instead of in the app.
//
//   node scripts/repair-llm-output.mjs out/llm/idea.json
//   node scripts/repair-llm-output.mjs out/llm/idea.json --in-place
//   node scripts/repair-llm-output.mjs out/llm/idea.json --strict
//
// Exit codes: 0 valid (after repair), 1 still invalid, 2 usage/read error,
// 3 write error.
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { addedWrapperFields, fillWrapperDefaults } from './wrapper-defaults.mjs'
import { validateDoc } from './validate.mjs'

/**
 * Repair a parsed document.
 *
 * `strict` refuses to fill: it reports what is missing and validates the document
 * exactly as handed over, so drift surfaces instead of being papered over.
 */
export function repairDocument(doc, { strict = false } = {}) {
  const filled = fillWrapperDefaults(doc)
  const missing = addedWrapperFields(doc, filled)
  const target = strict ? doc : filled
  const validation = validateDoc(target)
  return { doc: target, missing, validation, ok: validation.ok }
}

const USAGE = `usage: node scripts/repair-llm-output.mjs <file.json> [--in-place] [--strict]

  Fills the wrapper fields a skill may omit (schemaVersion, name, preset), prints
  what it filled, and validates the result.

  (default)    write <file>.repaired.json next to the input
  --in-place   overwrite the input instead
  --strict     fill nothing; report what is missing and validate as-is`

function formatErrors(errors) {
  return errors.map((e) => `    - ${e.instancePath || '(root)'}: ${e.message}`).join('\n')
}

function describeKind(doc) {
  const kind = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc.kind : undefined
  return typeof kind === 'string' ? kind : '(none)'
}

export function run(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith('-')))
  const files = argv.filter((arg) => !arg.startsWith('-'))

  for (const flag of flags) {
    if (flag !== '--in-place' && flag !== '--strict') {
      console.error(`unknown option: ${flag}\n\n${USAGE}`)
      return 2
    }
  }
  if (files.length !== 1) {
    console.error(USAGE)
    return 2
  }

  const inPlace = flags.has('--in-place')
  const strict = flags.has('--strict')
  const file = files[0]

  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    console.error(`cannot read ${file}: ${err.message}`)
    return 2
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`${file}: invalid JSON — ${err.message}`)
    return 2
  }

  const result = repairDocument(parsed, { strict })

  const label = (name, value) => console.log(`  ${name.padEnd(12)}${value}`)

  console.log(file)
  label('kind', describeKind(result.doc))
  label(
    strict ? 'missing' : 'filled',
    result.missing.length ? result.missing.join(', ') : '(nothing)',
  )
  label('validation', result.validation.ok ? 'PASS' : 'FAIL')
  if (!result.validation.ok) console.log(formatErrors(result.validation.errors))

  if (strict) {
    if (!result.validation.ok && result.missing.length > 0) {
      console.log(
        `\n--strict: ${result.missing.join(', ')} would have been filled. Fix the document at its source.`,
      )
    }
    return result.ok ? 0 : 1
  }

  if (!result.ok) return 1

  if (result.missing.length === 0) {
    console.log('\nNothing to repair — the wrapper is already complete.')
    return 0
  }

  const out = inPlace ? file : `${file}.repaired.json`
  try {
    writeAtomically(out, `${JSON.stringify(result.doc, null, 2)}\n`, { backup: inPlace })
  } catch (err) {
    console.error(`cannot write ${out}: ${err.message}`)
    return 3
  }
  console.log(`\nWrote ${out}${inPlace ? ` (original kept as ${out}.bak)` : ''}`)
  return 0
}

/**
 * Write via a temporary sibling and rename, so an interrupted write never
 * leaves a truncated file; with `backup`, keep the previous file as `.bak`
 * (#70 — --in-place used to overwrite the user's source with no backup).
 */
export function writeAtomically(file, text, { backup = false } = {}) {
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, text, 'utf8')
  try {
    if (backup && existsSync(file)) copyFileSync(file, `${file}.bak`)
    renameSync(tmp, file)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)))
}
