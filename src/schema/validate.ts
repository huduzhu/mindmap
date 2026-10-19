// Precompiled from schemas/*.schema.json by scripts/build-validators.mjs (#181):
// nothing is compiled at run time, so the CSP needs no 'unsafe-eval'.
import * as generated from './validators.generated.js'
import type { GeneratedValidator } from './validators.generated.js'

export interface ValidationError {
  instancePath?: string
  message?: string
  /** The schema rule that failed (Ajv's keyword), e.g. 'additionalProperties'. */
  keyword?: string
}

export interface ValidationResult {
  ok: boolean
  errors: ValidationError[]
}

export const KIND_TO_SCHEMA: Record<string, string> = {
  preset: 'preset.schema.json',
  project: 'project.schema.json',
  template: 'template.schema.json',
  'analysis-request': 'packet.schema.json',
  'brainstorm-update': 'brainstorm-update.schema.json',
}

const VALIDATORS: Record<string, GeneratedValidator> = {
  preset: generated.preset,
  project: generated.project,
  template: generated.template,
  'analysis-request': generated.analysis_request,
  'brainstorm-update': generated.brainstorm_update,
}

let cached: ((doc: unknown) => ValidationResult) | null = null

export function createValidator() {
  if (cached) return cached
  cached = (doc) => {
    const kind = doc && typeof doc === 'object' ? (doc as { kind?: unknown }).kind : undefined
    const validate = typeof kind === 'string' ? VALIDATORS[kind] : undefined
    if (!validate) {
      return {
        ok: false,
        errors: [{ message: `unknown or missing kind: ${JSON.stringify(kind)}` }],
      }
    }
    const ok = validate(doc)
    return { ok: Boolean(ok), errors: ok ? [] : [...(validate.errors ?? [])] }
  }
  return cached
}

export function validateDoc(doc: unknown): ValidationResult {
  return createValidator()(doc)
}

export function parseJson(text: string): { ok: true; doc: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, doc: JSON.parse(text) }
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map((e) => `- ${e.instancePath || '(root)'}: ${e.message}`).join('\n')
}
