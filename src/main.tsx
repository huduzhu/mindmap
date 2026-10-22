import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadMindMapCanvas, preloadLazyParts } from './components/lazyParts'
import { initLocale } from './i18n'
import { isFramed } from './pwa/framed'
import { registerServiceWorker } from './pwa/register'
import { setSaveBeforeReload } from './pwa/update'
import { useProjects } from './store/projects'

const root = document.getElementById('root')!

if (isFramed()) {
  // Not inside another site's frame (#180): only a link out.
  void import('./pwa/framedNotice').then(({ renderFramedNotice }) => renderFramedNotice(root))
} else {
  // English renders at once; another stored or browser language swaps in when
  // its (lazily loaded) table arrives (#89).
  void initLocale()

  // Updates wait for the user's Reload in the banner, which saves first (#94).
  setSaveBeforeReload(async () => {
    await useProjects.getState().saveCurrent()
  })
  if (import.meta.env.PROD) registerServiceWorker()

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // The map canvas is kept out of the first download so the start screen does
  // not wait for it, but most projects open in the map view: fetch it at once,
  // alongside the start-up work, not when the browser is idle.
  void loadMindMapCanvas().catch(() => undefined)

  // The views and dialogs kept out of the first download (#141) are fetched once
  // the browser is idle, so opening one later does not wait on the network.
  preloadLazyParts()
}
