// Wrapper fields a skill is allowed to omit.
//
// Shared by the importer (src/io/import.ts) and scripts/repair-llm-output.mjs so
// the CLI repairs exactly what the app would repair. A second copy here would
// drift, and drift is the failure this file exists to prevent (#30: a
// brainstorm-update arrived without its wrapper and surfaced as a failed user
// import).
//
// Deliberately plain ESM with no Node built-ins, so the browser bundle can
// import it. The CLI half needs node:fs and therefore lives in
// repair-llm-output.mjs.

// Must match src/schema/constants.ts. Kept as a literal rather than imported
// because scripts/ runs with no build step; src/io/wrapperDefaults.test.ts
// asserts the two stay equal.
export const SCHEMA_VERSION = 1

/** Kinds that carry a wrapper. `preset` and `analysis-request` do not. */
export const WRAPPER_KINDS = ['project', 'template', 'brainstorm-update']

export function fillWrapperDefaults(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return doc

  const filled = { ...doc }
  if (!WRAPPER_KINDS.includes(filled.kind)) return doc
  if (!Object.hasOwn(filled, 'schemaVersion')) filled.schemaVersion = SCHEMA_VERSION
  if (!Object.hasOwn(filled, 'name')) {
    const brainstorm = filled.brainstorm
    const root = filled.root
    const brainstormTitle =
      brainstorm && typeof brainstorm === 'object' && !Array.isArray(brainstorm)
        ? brainstorm.title
        : undefined
    const rootTitle =
      root && typeof root === 'object' && !Array.isArray(root) ? root.title : undefined
    filled.name = brainstormTitle ?? rootTitle ?? 'Untitled'
  }
  if (!Object.hasOwn(filled, 'preset')) filled.preset = 'default'
  return filled
}

/**
 * Wrapper keys present in `after` but not in `before` — the diff the CLI prints.
 * Derived from the two documents rather than recorded during filling, so there is
 * only one implementation of the fill itself.
 */
export function addedWrapperFields(before, after) {
  if (before === null || typeof before !== 'object' || Array.isArray(before)) return []
  if (after === null || typeof after !== 'object' || Array.isArray(after)) return []
  return Object.keys(after).filter((key) => !Object.hasOwn(before, key))
}
