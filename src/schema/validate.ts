import Ajv2020 from 'ajv/dist/2020'
import brainstormUpdateSchema from '../../schemas/brainstorm-update.schema.json'
import packetSchema from '../../schemas/packet.schema.json'
import presetSchema from '../../schemas/preset.schema.json'
import projectSchema from '../../schemas/project.schema.json'
import templateSchema from '../../schemas/template.schema.json'
import treeNodeSchema from '../../schemas/tree-node.schema.json'

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

// Same options as scripts/validate.mjs (see the comment there, #59).
export const AJV_OPTIONS = {
  allErrors: true,
  strictSchema: true,
  strictNumbers: true,
  strictTypes: true,
  strictTuples: true,
  strictRequired: false,
} as const

let cached: ((doc: unknown) => ValidationResult) | null = null

export function createValidator() {
  if (cached) return cached
  const ajv = new Ajv2020(AJV_OPTIONS)
  for (const schema of [
    treeNodeSchema,
    presetSchema,
    projectSchema,
    templateSchema,
    packetSchema,
    brainstormUpdateSchema,
  ]) {
    ajv.addSchema(schema)
  }
  cached = (doc) => {
    const kind = doc && typeof doc === 'object' ? (doc as { kind?: unknown }).kind : undefined
    const schemaId = typeof kind === 'string' ? KIND_TO_SCHEMA[kind] : undefined
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
