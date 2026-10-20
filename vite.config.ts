import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { basePath, readMetaContentSecurityPolicy } from './scripts/site-config.mjs'

// Test mode only: point the deprecated `react-dom/test-utils` at a local shim
// (#61, D1). This replaces a transform that string-patched
// @testing-library/react's act-compat.js; Vite resolves that package's ESM
// bundle (react.esm.js), so the patch never matched any file and never ran.
// src/test/actShim.test.tsx fails if this alias stops applying.
const testUtilsShim = fileURLToPath(new URL('./src/test/reactDomTestUtilsShim.ts', import.meta.url))

// Production builds get the Content-Security-Policy of public/_headers as a
// <meta> tag, for hosts that cannot send headers (e.g. GitHub Pages). Not in
// dev: Vite's HMR client needs inline scripts and a WebSocket.
const contentSecurityPolicy: Plugin = {
  name: 'mms-content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: readMetaContentSecurityPolicy() },
      injectTo: 'head-prepend',
    },
  ],
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const testOnly = mode === 'test'
  return {
    // "/" by default; BASE_PATH=/mindmap/ for a GitHub Pages project site.
    base: basePath(process.env.BASE_PATH),
    define: testOnly ? { 'process.env.NODE_ENV': JSON.stringify('development') } : undefined,
    plugins: [
      react(),
      contentSecurityPolicy,
      VitePWA({
        // Prompt, not autoUpdate (#94, decision O-D1): a new version waits for
        // the user's Reload in the banner (src/pwa/), so an open tab never
        // swaps builds under unsaved work. Registration is in src/pwa/register.ts.
        registerType: 'prompt',
        injectRegister: false,
        // The default workbox glob only precaches js/css/html, so favicon.svg
        // (linked from index.html) 404'd offline (#67). Anything else added to
        // public/ must be listed here too.
        //
        // Deliberate trade-off: public/viewer/viewer.iife.js (~370 KiB, over a
        // third of the precache) is precached so Export → Interactive HTML also
        // works offline.
        //
        // Sub-path deploys: `base` (BASE_PATH) also sets the manifest scope and
        // the service worker's URL and scope, and the manifest's icons and
        // start_url are relative to it, so a build for /mindmap/ stays inside
        // /mindmap/.
        //
        // Lazy chunks (#88: exporters, the precompiled schema validators, dialogs, the guide) are
        // ordinary .js files under assets/, so the default glob precaches them
        // and they load offline.
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Mind Map Studio',
          short_name: 'MindMap Studio',
          description:
            'Offline-first mind map & brainstorming studio with file-based LLM templates.',
          theme_color: '#6366f1',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '.',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    // dist/.vite/manifest.json lets scripts/check-bundle-size.mjs tell the chunks
    // loaded at start from the lazy ones (#88). Not precached (not js/css/html).
    build: { manifest: true },
    server: { port: 5173, strictPort: true },
    ...(testOnly
      ? {
          resolve: {
            dedupe: ['react', 'react-dom'],
            alias: [{ find: /^react-dom\/test-utils$/, replacement: testUtilsShim }],
          },
        }
      : {}),
    test: {
      // e2e/ holds Playwright specs (#63); they run with `npm run e2e`, not Vitest.
      exclude: [...configDefaults.exclude, 'e2e/**'],
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      pool: 'threads',
      // Tests that render the whole app (src/i18n/noEnglish.test.tsx,
      // PresentOverlay) take a few seconds and timed out at the 5 s default
      // on a busy machine (#217).
      testTimeout: 15_000,
      env: {
        NODE_ENV: 'development',
      },
      server: {
        deps: {
          inline: ['react', 'react-dom', '@testing-library/react', '@testing-library/dom'],
        },
      },
    },
  }
})
