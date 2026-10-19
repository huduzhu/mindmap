#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export function resolvePort(env = process.env) {
  if (env.MMS_DEV_PORT === undefined) return 5173

  const port = Number(env.MMS_DEV_PORT)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `MMS_DEV_PORT must be a positive integer; received ${JSON.stringify(env.MMS_DEV_PORT)}`,
    )
  }
  return port
}

export function buildViteArgs(env = process.env) {
  return ['--port', String(resolvePort(env)), '--strictPort']
}

/** Remember the spawned Vite pid so `npm stop` works before the port is bound (#57). */
export function writePidFile(
  pid,
  port,
  file = path.join(ROOT, 'node_modules', '.cache', 'mms-dev.json'),
) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ pid, port })}\n`)
  return file
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(vite)) {
    console.error('start-dev: node_modules/vite is missing — run `npm install` first.')
    process.exit(1)
  }
  const port = resolvePort()
  const child = spawn(process.execPath, [vite, ...buildViteArgs()], { cwd: ROOT, stdio: 'inherit' })
  const pidFile = child.pid ? writePidFile(child.pid, port) : null

  child.on('error', (error) => {
    console.error(`start-dev: could not start Vite: ${error.message}`)
    process.exit(1)
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal)
    })
  }

  child.on('close', (code) => {
    if (pidFile) rmSync(pidFile, { force: true })
    process.exit(code ?? 1)
  })
}
