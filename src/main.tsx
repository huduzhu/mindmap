import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadLazyParts } from './components/lazyParts'
import { initLocale } from './i18n'
import { registerServiceWorker } from './pwa/register'
import { setSaveBeforeReload } from './pwa/update'
import { useProjects } from './store/projects'

// English renders at once; another stored or browser language swaps in when
// its (lazily loaded) table arrives (#89).
void initLocale()

// Updates wait for the user's Reload in the banner, which saves first (#94).
setSaveBeforeReload(() => useProjects.getState().saveCurrent())
if (import.meta.env.PROD) registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The views and dialogs kept out of the first download (#141) are fetched once
// the browser is idle, so opening one later does not wait on the network.
preloadLazyParts()
