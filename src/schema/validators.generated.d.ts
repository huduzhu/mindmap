// Types for validators.generated.js (scripts/build-validators.mjs).
import type { ValidationError } from './validate'

export interface GeneratedValidator {
  (doc: unknown): boolean
  errors?: ValidationError[] | null
}

export const preset: GeneratedValidator
export const project: GeneratedValidator
export const template: GeneratedValidator
export const analysis_request: GeneratedValidator
export const brainstorm_update: GeneratedValidator
