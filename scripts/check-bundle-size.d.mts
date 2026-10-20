export const DEFAULT_BUDGET_KB: number
export function initialChunks(manifest: Record<string, unknown>): {
  initial: string[]
  lazy: string[]
}
export type Sizes = { raw: number; gzip: number }
export function measure(contents: Uint8Array): Sizes
export function sizeColumns(sizes: Sizes): string
