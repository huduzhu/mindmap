export const ROOT: string
export function collectFiles(root?: string): string[]
export function offlineReadme(version: string): string
export function appEntries(version: string, root?: string): { name: string; data: Uint8Array }[]
