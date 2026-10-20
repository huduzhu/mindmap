import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone viewer bundle: a single self-contained IIFE that gets inlined into
// exported .html files, so the export works offline with zero setup.
export default defineConfig({
  plugins: [react()],
  // Library builds don't get the automatic NODE_ENV define, and bundled deps
  // (zustand, react) read process.env.NODE_ENV at runtime.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist-viewer',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/viewer/main.tsx',
      formats: ['iife'],
      name: 'MMSViewer',
      fileName: () => 'viewer.iife.js',
    },
  },
})
