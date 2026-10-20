export interface ValidationError {
  instancePath?: string
  message?: string
}

export interface ValidationResult {
  ok: boolean
  /** Set when the file could not be read (as opposed to failing the schema). */
  readError?: boolean
  errors: ValidationError[]
}

export function createValidator(): (doc: unknown) => ValidationResult
export function validateDoc(doc: unknown): ValidationResult
export function validateFile(file: string): ValidationResult
export const KIND_TO_SCHEMA: Record<string, string>
export function expandArgs(args: string[], cwd?: string): string[]
export const AJV_OPTIONS: Record<string, boolean>
export function schemaFiles(root?: string): string[]
