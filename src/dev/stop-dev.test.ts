// @vitest-environment node

import {
  describeResult,
  findPid,
  findPids,
  findPidWindows,
  kill,
  parseNetstatPids,
  readPidFile,
  stopDev,
} from '../../scripts/stop-dev.mjs'

import { vi } from 'vitest'

test('defaults to port 5173 and never probes 5174', async () => {
  const findPid = vi.fn(async (port: number) => {
    expect(port).toBe(5173)
    expect(port).not.toBe(5174)
    return undefined
  })
  const kill = vi.fn()

  await stopDev({ env: {}, findPid, kill })

  expect(findPid).toHaveBeenCalledOnce()
  expect(kill).not.toHaveBeenCalled()
})

test('uses MMS_DEV_PORT when set', async () => {
  const findPid = vi.fn(async (port: number) => {
    expect(port).toBe(4000)
    return undefined
  })

  await stopDev({ env: { MMS_DEV_PORT: '4000' }, findPid, kill: vi.fn() })

  expect(findPid).toHaveBeenCalledWith(4000)
})

test('rejects a non-numeric MMS_DEV_PORT before looking for a listener', async () => {
  const findPid = vi.fn()
  const kill = vi.fn()

  await expect(
    Promise.resolve().then(() => stopDev({ env: { MMS_DEV_PORT: 'not-a-port' }, findPid, kill })),
  ).rejects.toThrow(/MMS_DEV_PORT.*positive integer/)
  expect(findPid).not.toHaveBeenCalled()
  expect(kill).not.toHaveBeenCalled()
})

test('does nothing successfully when no listener is found', async () => {
  const findPid = vi.fn(async () => null)
  const kill = vi.fn()

  await stopDev({ env: {}, findPid, kill })
  expect(kill).not.toHaveBeenCalled()
})

test('sends SIGTERM only to the pid returned by the finder', async () => {
  const foundPid = 4242
  const findPid = vi.fn(async () => foundPid)
  const kill = vi.fn()

  await stopDev({ env: { MMS_DEV_PORT: '4321' }, findPid, kill })

  expect(findPid).toHaveBeenCalledWith(4321)
  expect(kill).toHaveBeenCalledOnce()
  expect(kill).toHaveBeenCalledWith(foundPid, 'SIGTERM')
})

// `npm stop` was unusable on Windows: discovery shelled out to lsof, which does
// not exist there, so it failed with `spawn lsof ENOENT` and the server had to be
// killed by hand. These cover the netstat path that replaced it.

const NETSTAT = [
  '',
  'Active Connections',
  '',
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    127.0.0.1:5199         0.0.0.0:0              LISTENING       26872',
  '  TCP    [::1]:5199             [::]:0                 LISTENING       26872',
  '  TCP    127.0.0.1:52342        127.0.0.1:5199         ESTABLISHED     30100',
  '  TCP    127.0.0.1:15173        0.0.0.0:0              LISTENING       41000',
  '  UDP    0.0.0.0:5353           *:*                                    8',
  '',
].join('\r\n')

test('parses the listening pid out of netstat output', () => {
  expect(parseNetstatPids(NETSTAT, 5199)).toEqual([26872])
})

test('dedupes the IPv4 and IPv6 rows a single server produces', () => {
  // Both rows above are pid 26872; returning it twice would make stopDev think
  // two different servers held the port.
  expect(parseNetstatPids(NETSTAT, 5199)).toHaveLength(1)
})

test('does not let port 5173 match 15173', () => {
  expect(parseNetstatPids(NETSTAT, 5173)).toEqual([])
})

test('ignores established connections on the same port', () => {
  // The 30100 row has :5199 as its *foreign* address — it is a client, not the
  // server, and must never be terminated.
  expect(parseNetstatPids(NETSTAT, 5199)).not.toContain(30100)
})

test('finds an IPv6-only listener, which is how Vite binds here', () => {
  // `netstat -ano -p tcp` omits this row entirely on Windows — it is TCPv4-only.
  // This is the exact case that left the dev server running after `npm stop`.
  const ipv6Only = '  TCP    [::1]:5173             [::]:0        LISTENING       29588'
  expect(parseNetstatPids(ipv6Only, 5173)).toEqual([29588])
})

test('returns nothing when the port is free', () => {
  expect(parseNetstatPids(NETSTAT, 6000)).toEqual([])
  expect(parseNetstatPids('', 5199)).toEqual([])
  expect(parseNetstatPids(undefined, 5199)).toEqual([])
})

test('findPidWindows returns the first pid netstat reports', async () => {
  const runner = vi.fn(async () => ({ stdout: NETSTAT, stderr: '' }))
  expect(await findPidWindows(5199, runner)).toBe(26872)
  // No `-p tcp`: on Windows that filter is TCPv4-only and would miss the IPv6
  // listener Vite actually binds. See NETSTAT_ARGS in stop-dev.mjs.
  expect(runner).toHaveBeenCalledWith('netstat', ['-ano'])
})

test('findPidWindows returns null when nothing is listening', async () => {
  const runner = vi.fn(async () => ({ stdout: NETSTAT, stderr: '' }))
  expect(await findPidWindows(6000, runner)).toBeNull()
})

test('findPidWindows surfaces a missing or failing netstat', async () => {
  const runner = vi.fn(async () => {
    throw new Error('spawn netstat ENOENT')
  })
  await expect(findPidWindows(5199, runner)).rejects.toThrow(
    /could not discover the listener on port 5199/,
  )
})

test('findPid dispatches to netstat on Windows and lsof elsewhere', async () => {
  const runner = vi.fn(async (tool: string) =>
    tool === 'netstat' ? { stdout: NETSTAT, stderr: '' } : { stdout: '777\n', stderr: '' },
  )

  expect(await findPid(5199, runner, 'win32')).toBe(26872)
  expect(runner).toHaveBeenLastCalledWith('netstat', ['-ano'])

  expect(await findPid(5199, runner, 'linux')).toBe(777)
  expect(runner).toHaveBeenLastCalledWith('lsof', ['-nP', '-t', '-iTCP:5199', '-sTCP:LISTEN'])

  expect(await findPid(5199, runner, 'darwin')).toBe(777)
})

// #57: npm stop was silent, reported `stopped: true` for a killer that returned
// undefined, only handled English netstat, and kept only the first pid.

test('reports what it did, and only counts a kill that returned true', async () => {
  const none = await stopDev({ env: {}, findPid: async () => [], kill: vi.fn() })
  expect(describeResult(none)).toBe('stop-dev: nothing listening on :5173')

  const vague = await stopDev({ env: {}, findPid: async () => 4242, kill: vi.fn() })
  expect(vague.stopped).toEqual([])
  expect(describeResult(vague)).toMatch(/already exited/)

  const real = await stopDev({
    env: {},
    findPid: async () => [4242, 4343],
    kill: vi.fn(async () => true),
  })
  expect(real.stopped).toEqual([4242, 4343])
  expect(describeResult(real)).toBe('stop-dev: stopped pid 4242, 4343 on :5173')
})

test('matches listeners in localized netstat output', () => {
  const german = [
    '  Proto  Lokale Adresse         Remoteadresse          Status           PID',
    '  TCP    [::1]:5173             [::]:0                 ABHÖREN          29588',
    '  TCP    127.0.0.1:5173         0.0.0.0:0              ABHÖREN          29600',
    '  TCP    127.0.0.1:50000        127.0.0.1:5173         HERGESTELLT      30100',
  ].join('\r\n')
  expect(parseNetstatPids(german, 5173)).toEqual([29588, 29600])
})

test('findPids returns every listener, not just the first', async () => {
  const netstat =
    '  TCP    [::1]:5173   [::]:0   LISTENING   1111\r\n  TCP    0.0.0.0:5173   0.0.0.0:0   LISTENING   2222'
  const runner = vi.fn(async (tool: string) =>
    tool === 'netstat' ? { stdout: netstat, stderr: '' } : { stdout: '777\n778\n', stderr: '' },
  )
  expect(await findPids(5173, runner, 'win32')).toEqual([1111, 2222])
  expect(await findPids(5173, runner, 'linux')).toEqual([777, 778])
})

test('prefers the pid recorded by npm start over a port scan', async () => {
  const finder = vi.fn(async () => [9999])
  const killer = vi.fn(async () => true)
  const result = await stopDev({
    env: {},
    findPid: finder,
    kill: killer,
    readPidFile: () => ({ pid: 5555, port: 5173 }),
  })
  expect(finder).not.toHaveBeenCalled()
  expect(killer).toHaveBeenCalledWith(5555, 'SIGTERM')
  expect(result.stopped).toEqual([5555])
})

test('ignores a stale pid file', () => {
  const processApi = {
    kill: () => {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    },
  }
  expect(readPidFile('/definitely/not/here.json', processApi)).toBeNull()
})

test('kill treats an already-gone process as not stopped', () => {
  const processApi = {
    kill: () => {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    },
  }
  expect(kill(4242, 'SIGTERM', processApi)).toBe(false)
  expect(kill(4242, 'SIGTERM', { kill: () => true })).toBe(true)
  expect(() => kill(1, 'SIGTERM', { kill: () => true })).toThrow(/invalid pid/)
})
