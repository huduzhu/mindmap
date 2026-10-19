/**
 * Wrap `run` so it runs at most once per `minGapMs`, counting from when the
 * wrapper is made (#143: service-worker update checks on window focus). The
 * clock is a parameter for tests.
 */
export function throttled(
  run: () => void,
  minGapMs: number,
  now: () => number = Date.now,
): () => void {
  let last = now()
  return () => {
    const time = now()
    if (time - last < minGapMs) return
    last = time
    run()
  }
}
