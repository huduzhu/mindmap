type Runner = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string } | string>
interface ProcessApi {
  kill: (pid: number, signal?: string | number) => unknown
}

export const ROOT: string
export function parseNetstatPids(output: string | undefined, port: number): number[]
export function findPidsWindows(port: number, runner?: Runner): Promise<number[]>
export function findPidWindows(port: number, runner?: Runner): Promise<number | null>
export function findPidLsof(port: number, runner?: Runner): Promise<number | null>
export function findPidsLsof(port: number, runner?: Runner): Promise<number[]>
export function findPids(port: number, runner?: Runner, platform?: string): Promise<number[]>
export function findPid(port: number, runner?: Runner, platform?: string): Promise<number | null>
export function kill(pid: number, signal?: string, processApi?: ProcessApi): boolean
export function pidFilePath(root?: string): string
export function readPidFile(
  file?: string,
  processApi?: ProcessApi,
): { pid: number; port: number | null } | null

export interface StopDevOptions {
  env?: Record<string, string | undefined>
  findPid?: (
    port: number,
  ) => Promise<number | number[] | null | undefined> | number | number[] | null | undefined
  finder?: StopDevOptions['findPid']
  kill?: (pid: number, signal: string) => unknown
  killer?: StopDevOptions['kill']
  readPidFile?: () => { pid: number; port: number | null } | null
}

export interface StopDevResult {
  port: number
  pids: number[]
  stopped: number[]
}

export function stopDev(options?: StopDevOptions): Promise<StopDevResult>
export function describeResult(result: StopDevResult): string
