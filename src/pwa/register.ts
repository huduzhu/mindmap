/// <reference types="vite-plugin-pwa/vanillajs" />
import { registerSW } from 'virtual:pwa-register'
import { throttled } from './throttle'
import { notifyUpdateReady, saveAndReload } from './update'

/** Look for a new version this often while the app stays open (#94). */
const UPDATE_CHECK_MS = 60 * 60 * 1000
/** Coming back to the window checks too, but at most this often (#143). */
const FOCUS_CHECK_MS = 10 * 60 * 1000

/**
 * Register the service worker in prompt mode (#94): a new version waits until
 * the user chooses Reload in the banner. When another tab applies the update,
 * this one saves and reloads too, so no tab keeps running an old build
 * against the new cache.
 */
export function registerServiceWorker(): void {
  const update = registerSW({
    immediate: true,
    onNeedRefresh: () => notifyUpdateReady(update),
    onNeedReload: () => void saveAndReload(),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {})
      }
      // Registering has just checked, so the first focus check waits out the gap too.
      const onFocus = throttled(check, FOCUS_CHECK_MS)
      window.setInterval(check, UPDATE_CHECK_MS)
      window.addEventListener('focus', onFocus)
    },
  })
}
