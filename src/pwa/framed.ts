/**
 * The hosted app inside another site's frame (#180). GitHub Pages cannot send
 * `frame-ancestors`, so the app checks for itself and refuses to run framed:
 * a page could otherwise overlay it to trick clicks.
 */
export function isFramed(win: Window = window): boolean {
  try {
    return win.top !== win.self
  } catch {
    // A cross-origin parent can make even the comparison throw.
    return true
  }
}
