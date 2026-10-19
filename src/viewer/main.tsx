import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './viewer.css'
import { ViewerApp } from './ViewerApp'
import { viewerLocale, viewerText } from './strings'

const container = document.getElementById('mms-root')
if (!container) throw new Error('missing #mms-root element')

if (!window.__MMS_DATA__) {
  container.textContent = viewerText(viewerLocale(navigator.language), 'missing')
} else {
  // The page's language follows the app's language at export time (#99).
  document.documentElement.lang = viewerLocale(window.__MMS_DATA__.locale)
  createRoot(container).render(
    <StrictMode>
      <ViewerApp data={window.__MMS_DATA__} />
    </StrictMode>,
  )
}
