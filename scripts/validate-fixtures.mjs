#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { ROOT, validateFile } from './validate.mjs'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.json')) out.push(full)
  }
  return out
}

// Every group must contain files: a renamed or emptied directory used to make
// this gate print "0 valid + 0 invalid … 0 failure(s)" and exit 0 (#59).
// examples/ is included so the examples README's claim is gated (#69).
const GROUPS = {
  valid: ['fixtures', 'valid'],
  golden: ['fixtures', 'golden'],
  presets: ['presets'],
  examples: ['examples'],
  invalid: ['fixtures', 'invalid'],
}

const found = {}
let failures = 0
for (const [group, parts] of Object.entries(GROUPS)) {
  const dir = path.join(ROOT, ...parts)
  found[group] = existsSync(dir) ? walk(dir) : []
  if (found[group].length === 0) {
    failures += 1
    console.log(`FAIL (no fixtures found)    ${path.relative(ROOT, dir)}/*.json`)
  }
}

const expectValid = [...found.valid, ...found.golden, ...found.presets, ...found.examples]
const expectInvalid = found.invalid

for (const file of expectValid) {
  const result = validateFile(file)
  const label = path.relative(ROOT, file)
  if (result.ok) {
    console.log(`PASS (valid as expected)    ${label}`)
  } else {
    failures += 1
    console.log(`FAIL (valid file rejected)  ${label}`)
    for (const e of result.errors) console.log(`       ${e.instancePath || '(root)'}: ${e.message}`)
  }
}

for (const file of expectInvalid) {
  const result = validateFile(file)
  const label = path.relative(ROOT, file)
  if (!result.ok) {
    console.log(`PASS (invalid as expected)  ${label}`)
  } else {
    failures += 1
    console.log(`FAIL (invalid file accepted) ${label}`)
  }
}

console.log(
  `\n${expectValid.length} valid + ${expectInvalid.length} invalid fixtures checked, ${failures} failure(s).`,
)
process.exit(failures === 0 ? 0 : 1)
