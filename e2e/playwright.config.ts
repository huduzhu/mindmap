import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

// Browser E2E (#63). Two targets:
//   built — `vite preview` of dist/ (run `npm run build` first); every spec except dev.spec.ts
//   dev   — `npm run dev`; only dev.spec.ts (checks that need the dev server, e.g. #55)
// Set E2E_BASE_URL to point the built project at an already-running server (no webServer).
//
// Everything is pinned to 127.0.0.1: on GitHub's Ubuntu runners with Node 24,
// "localhost" resolves to ::1 while the servers listened on IPv4, so the
// webServer readiness probe never connected and timed out after 60 s.
const external = process.env.E2E_BASE_URL
const BUILT_URL = external ?? 'http://127.0.0.1:4173'
const DEV_URL = process.env.E2E_DEV_URL ?? 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]]
    : 'list',
  outputDir: '../test-results',
  use: {
    ...devices['Desktop Chrome'],
    acceptDownloads: true,
    // The PWA service worker caches aggressively; tests want the page as built.
    serviceWorkers: 'block',
    // Chromium drops non-ASCII download names unless the locale is UTF-8, which
    // would make the #51 check depend on the machine running it.
    launchOptions: { env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'built', testIgnore: /dev\.spec\.ts$/, use: { baseURL: BUILT_URL } },
    ...(external ? [] : [{ name: 'dev', testMatch: /dev\.spec\.ts$/, use: { baseURL: DEV_URL } }]),
  ],
  webServer: external
    ? undefined
    : [
        {
          command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
          url: BUILT_URL,
          cwd: ROOT,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          // predev builds the interactive-HTML viewer when it is missing (#55).
          command: 'npm run dev -- --host 127.0.0.1',
          url: DEV_URL,
          cwd: ROOT,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      ],
})
