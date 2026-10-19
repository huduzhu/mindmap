export const ROOT: string
export function resolvePort(env?: Record<string, string | undefined>): number
export function buildViteArgs(env?: Record<string, string | undefined>): string[]
export function writePidFile(pid: number, port: number, file?: string): string
