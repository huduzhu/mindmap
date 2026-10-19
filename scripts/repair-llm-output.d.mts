import type { ValidationResult } from './validate.mjs'

export interface RepairResult {
  doc: unknown
  missing: string[]
  validation: ValidationResult
  ok: boolean
}

export function repairDocument(doc: unknown, options?: { strict?: boolean }): RepairResult
export function run(argv: string[]): number
export function writeAtomically(file: string, text: string, options?: { backup?: boolean }): void
