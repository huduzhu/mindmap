#!/usr/bin/env node
import { execFile as nodeExecFile } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePort } from './start-dev.mjs'

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const execFile = (file, args) =>
  new Promise((resolve, reject) => {
    nodeExecFile(file, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })

function invalidPid(pid) {
  return !Number.isSafeInteger(pid) || pid <= 0 || pid === 1
}

function parsePid(output) {
  const value = String(output ?? '').trim()
  if (!value) return null

  const first = value.split(/\s+/)[0]
  const pid = Number(first)
  if (invalidPid(pid) || !/^\d+$/.test(first)) {
    throw new Error(`discovery returned an invalid pid: ${JSON.stringify(first)}`)
  }
  return pid
}

/**
 * Windows has no lsof, so discovery goes through netstat there instead.
 *
 * No `-p tcp` filter, deliberately. On Windows that filter means "TCPv4 only" and
 * silently omits IPv6 listeners — and Vite binds `[::1]:5173` on this machine, so
 * with the filter `npm stop` found nothing and left the server running. Unfiltered
 * output covers both families; the parser already drops UDP rows.
 */
const NETSTAT_ARGS = ['-ano']

const WILDCARD_FOREIGN = new Set(['0.0.0.0:0', '[::]:0', '*:*'])

/**
 * Pull the listening pids for `port` out of `netstat -ano` output.
 *
 * Rows look like:
 *   TCP    127.0.0.1:5199      0.0.0.0:0      LISTENING       26872
 *   TCP    [::1]:5199          [::]:0         LISTENING       26872
 *
 * A single server can appear twice (IPv4 and IPv6), so pids are deduped in
 * first-seen order. The local address is matched on a `:<port>` suffix, which
 * keeps port 5173 from matching 15173.
 */
export function parseNetstatPids(output, port) {
  const pids = []
  for (const line of String(output ?? '').split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/)
    if (tokens.length < 5) continue
    if (tokens[0].toUpperCase() !== 'TCP') continue
    // The state column is localized ("ABHÖREN", "ÉCOUTE", …), so also accept a
    // row whose foreign address is the wildcard every TCP listener has (#57).
    const listening =
      tokens[tokens.length - 2].toUpperCase() === 'LISTENING' || WILDCARD_FOREIGN.has(tokens[2])
    if (!listening) continue
    if (!tokens[1].endsWith(`:${port}`)) continue
    const raw = tokens[tokens.length - 1]
    if (!/^\d+$/.test(raw) || invalidPid(Number(raw))) continue
    const pid = Number(raw)
    if (!pids.includes(pid)) pids.push(pid)
  }
  return pids
}

/** Every pid listening on a TCP port, via netstat (Windows). */
export async function findPidsWindows(port, runner = execFile) {
  let result
  try {
    result = await runner('netstat', NETSTAT_ARGS)
  } catch (error) {
    throw new Error(`could not discover the listener on port ${port}: ${error?.message ?? error}`)
  }
  return parseNetstatPids(typeof result === 'string' ? result : result?.stdout, port)
}

/** Find the (first) process listening on a TCP port using netstat (Windows). */
export async function findPidWindows(port, runner = execFile) {
  return (await findPidsWindows(port, runner))[0] ?? null
}

/** Find the process listening on a TCP port using lsof (macOS, Linux). */
export async function findPidLsof(port, runner = execFile) {
  let result
  try {
    result = await runner('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'])
  } catch (error) {
    // lsof uses status 1 for an empty result. Other failures (including a
    // missing or inaccessible discovery tool) must remain visible to callers.
    if (
      error?.code === 1 &&
      typeof error?.stderr === 'string' &&
      typeof error?.stdout === 'string' &&
      error.stderr.trim() === '' &&
      error.stdout.trim() === ''
    ) {
      return null
    }
    throw new Error(`could not discover the listener on port ${port}: ${error?.message ?? error}`)
  }
  return parsePid(typeof result === 'string' ? result : result?.stdout)
}

/** Every pid listening on a TCP port (lsof prints one per line). */
export async function findPidsLsof(port, runner = execFile) {
  let result
  try {
    result = await runner('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'])
  } catch (error) {
    if (
      error?.code === 1 &&
      typeof error?.stderr === 'string' &&
      typeof error?.stdout === 'string' &&
      error.stderr.trim() === '' &&
      error.stdout.trim() === ''
    ) {
      return []
    }
    throw new Error(`could not discover the listener on port ${port}: ${error?.message ?? error}`)
  }
  const pids = []
  for (const line of String(typeof result === 'string' ? result : (result?.stdout ?? '')).split(
    /\r?\n/,
  )) {
    const pid = parsePid(line)
    if (pid !== null && !pids.includes(pid)) pids.push(pid)
  }
  return pids
}

/** Every pid listening on a TCP port; the platform picks netstat or lsof. */
export async function findPids(port, runner = execFile, platform = process.platform) {
  return platform === 'win32' ? findPidsWindows(port, runner) : findPidsLsof(port, runner)
}

/**
 * Find the process listening on a TCP port.
 *
 * `platform` is injectable so the netstat path is testable off Windows, and
 * `runner` so tests can supply canned output instead of shelling out.
 */
export async function findPid(port, runner = execFile, platform = process.platform) {
  return platform === 'win32' ? findPidWindows(port, runner) : findPidLsof(port, runner)
}

/** Send one signal to a validated process, treating an already-gone process as success. */
export function kill(pid, signal = 'SIGTERM', processApi = process) {
  // Keep the process API injectable as the second argument for small unit tests.
  if (signal && typeof signal === 'object') {
    processApi = signal
    signal = 'SIGTERM'
  }
  if (invalidPid(pid)) throw new Error(`refusing to terminate invalid pid: ${JSON.stringify(pid)}`)
  try {
    processApi.kill(pid, signal)
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    throw error
  }
  return true
}

/**
 * Where `npm start` records the Vite child it spawned, so `npm stop` can find
 * the server even before it has bound the port (#57).
 */
export function pidFilePath(root = ROOT) {
  return path.join(root, 'node_modules', '.cache', 'mms-dev.json')
}

export function readPidFile(file = pidFilePath(), processApi = process) {
  let record
  try {
    record = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  const pid = Number(record?.pid)
  if (invalidPid(pid)) return null
  try {
    processApi.kill(pid, 0)
  } catch {
    return null // stale file: that process is gone
  }
  return { pid, port: Number(record?.port) || null }
}

function asPidList(found) {
  if (found == null) return []
  const list = Array.isArray(found) ? found : [found]
  for (const pid of list) {
    if (invalidPid(pid))
      throw new Error(`refusing to terminate invalid pid: ${JSON.stringify(pid)}`)
  }
  return [...new Set(list)]
}

/**
 * Stop the dev server. Returns `{ port, pids, stopped }` where `stopped` lists
 * the pids that were actually signalled — a killer that returns anything but
 * `true` does not count (the old `stopped !== false` reported success for
 * `undefined`).
 */
export async function stopDev(options = {}) {
  const env = options.env ?? process.env
  const finder = options.findPid ?? options.finder ?? findPids
  const killer = options.kill ?? options.killer ?? kill
  const readPid = options.readPidFile ?? (() => null)
  const port = resolvePort(env)
  const recorded = readPid()
  const pids = asPidList(
    recorded && (recorded.port === null || recorded.port === port)
      ? recorded.pid
      : await finder(port),
  )
  const stopped = []
  for (const pid of pids) {
    let result
    try {
      result = await killer(pid, 'SIGTERM')
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
      result = false
    }
    if (result === true) stopped.push(pid)
  }
  return { port, pids, stopped }
}

export function describeResult({ port, pids, stopped }) {
  if (pids.length === 0) return `stop-dev: nothing listening on :${port}`
  if (stopped.length === 0) return `stop-dev: pid ${pids.join(', ')} on :${port} had already exited`
  return `stop-dev: stopped pid ${stopped.join(', ')} on :${port}`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stopDev({ readPidFile: () => readPidFile() })
    .then((result) => {
      // Stopping a server that is not running is not an error (like
      // `systemctl stop`), but it is no longer silent.
      console.log(describeResult(result))
      if (result.stopped.length > 0) rmSync(pidFilePath(), { force: true })
    })
    .catch((error) => {
      console.error(`stop-dev: ${error?.message ?? error}`)
      process.exitCode = 1
    })
}
